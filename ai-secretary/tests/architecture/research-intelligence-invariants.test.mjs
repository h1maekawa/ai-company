import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const read = (p) => fs.readFileSync(path.join(root, p), "utf8");
const dir = "app/lib/company/research/intelligence";
const stripComments = (source) => source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const intelligence = fs.readdirSync(path.join(root, dir)).map((file) => [file, stripComments(read(`${dir}/${file}`))]);

test("R&I reuses the existing Research Platform, Execution Store and Knowledge Capture (no second runtime/DB)", () => {
  const service = read(`${dir}/service.ts`);
  const engine = read(`${dir}/engine.ts`);
  assert.match(service, /loadExecutionState, saveExecutionState/);
  assert.match(service, /executionTransaction/);
  assert.match(service, /captureKnowledgeCandidate/);
  assert.match(service, /researchArtifacts: artifacts, researchItems: items/);
  assert.match(engine, /dedupeResearch, toResearchItem, withinRuntimeBudget/);
  for (const [file, source] of intelligence) {
    assert.doesNotMatch(source, /getRedisClient|new Redis|saveVaultFile|writeFile|createStore|promoteCandidate|promoteToKnowledge/, `${file} must not create another store or promote Knowledge`);
  }
});

test("R&I never hands off to Trade, Publish, Deploy, Skill Registry or Constitution", () => {
  for (const [file, source] of intelligence) {
    assert.doesNotMatch(source, /actionGateway|INVESTMENT_TRADE|publishing\/|buffer|saveSocialDrafts|dispatchFromChat|skillRegistry|SKILL_REGISTRY|savePolicy|recordDecision|octokit|deploy/i, file);
  }
  const route = read("app/api/company/research/route.ts");
  assert.match(route, /NOT_A_RESEARCH_REQUEST/);
  assert.match(route, /isSameOriginMutation/);
});

test("Executive Router runs the deterministic Layer 1 before any LLM call and keeps keywords in one config", () => {
  const executive = read("app/lib/router/executive.ts");
  assert.ok(executive.indexOf("preRoute(message)") < executive.indexOf("callAI("), "Layer 1 must precede the Executive LLM");
  assert.match(executive, /target: "research"/);
  const pre = read("app/lib/router/preRouter.ts");
  assert.match(pre, /export const PRE_ROUTER_RULES/);
  assert.doesNotMatch(pre, /callAI|import /, "Layer 1 has no LLM or I/O");
  const chat = read("app/api/chat/route.ts");
  assert.match(chat, /routeResult\.target === "research"[\s\S]*runInteractiveResearch/);
});

test("Research classification is a single LLM call; the rest is deterministic", () => {
  const routing = read(`${dir}/routing.ts`);
  assert.equal((routing.match(/await classify\(/g) ?? []).length, 1);
  const service = read(`${dir}/service.ts`);
  assert.equal((service.match(/classifyResearch\(/g) ?? []).length, 1);
});

test("Only three playbooks exist and no per-platform or per-topic researcher agents were added", () => {
  const playbooks = read(`${dir}/playbooks.ts`);
  assert.equal((playbooks.match(/^\s{2}"(?:company|theme|platform)-research": \{/gm) ?? []).length, 3);
  const agents = read("app/lib/config/departments.ts");
  assert.doesNotMatch(agents, /id: "(?:x|tiktok|instagram|note|company|theme|hbm|ai)-research(?:er)?"/);
});

test("Scheduled department research keeps its own path and does not use the interactive router", () => {
  const cron = read("app/api/cron/department-research/route.ts");
  assert.doesNotMatch(cron, /runInteractiveResearch|classifyResearch|preRoute/);
  assert.match(cron, /retainResearchArtifacts/);
  assert.match(read("app/lib/company/research/platform.ts"), /export function researchFingerprint/);
});

test("Research sources come from provider results only", () => {
  const engine = read(`${dir}/engine.ts`);
  assert.match(engine, /allowlist\.has\(claimedUrl\)/);
  assert.match(engine, /URLは書かないこと/);
});

/* ─── R&I MVP Final Integrity Fix ─── */

test("Fact references are stable ids, not array indices; ids are deterministic (no Random UUID)", () => {
  const types = read("app/lib/company/research/types.ts");
  assert.match(types, /export type FactRef = string;/);
  assert.match(types, /id: string;\s*\n\s*statement: string;\s*\n\s*kind: FactKind;/);
  const evidence = read(`${dir}/evidence.ts`);
  assert.match(evidence, /export function factId/);
  assert.doesNotMatch(evidence, /randomUUID/);
  const engine = read(`${dir}/engine.ts`);
  assert.doesNotMatch(engine, /randomUUID\(\)[^;]*factId|Math\.random/);
  assert.match(engine, /positionToId/, "LLM出力のsourceIndex/factRefsはstable idへ変換してから保存する");
});

test("mergeRefreshedFacts dedupes by stable fact id, not by url|statement position", () => {
  const evidence = read(`${dir}/evidence.ts`);
  assert.match(evidence, /export function mergeRefreshedFacts[\s\S]{0,300}fresh\.map\(\(fact\) => fact\.id\)/);
});

test("Provider Evidence model: a URL-less item can still be Evidence via evidenceId, but a fabricated LLM URL is fully rejected (not routed to evidenceId)", () => {
  const engine = read(`${dir}/engine.ts`);
  assert.match(engine, /evidenceId = !url && !urlRejected && item/);
  assert.match(engine, /urlRejected = claimedByLlm && !url/);
  const evidence = read(`${dir}/evidence.ts`);
  assert.match(evidence, /export function hasEvidence/);
  assert.match(evidence, /fact\.source\.url \|\| fact\.source\.evidenceId/);
});

test("Fact kind is schema-driven (LLM-declared) with a fail-safe default, not guessed from a statement regex", () => {
  const types = read("app/lib/company/research/types.ts");
  assert.match(types, /export const FACT_KINDS = \["general", "financial", "earnings", "valuation"\] as const;/);
  const evidence = read(`${dir}/evidence.ts`);
  assert.match(evidence, /export function normalizeFactKind[\s\S]{0,200}"general"/);
  assert.doesNotMatch(evidence, /revenue\|sales\|eps\|earnings/i, "文章Regexでkindを推測しない");
  const engine = read(`${dir}/engine.ts`);
  assert.match(engine, /normalizeFactKind\(entry\?\.kind\)/);
});

test("Artifact status denominator excludes stale (TTL-expired) facts kept from a previous refresh", () => {
  const evidence = read(`${dir}/evidence.ts`);
  assert.match(evidence, /const activeFacts = facts\.filter/);
  assert.doesNotMatch(evidence, /investment: boolean/, "artifactStatus/isQualifyingFactはkind単位で判定し、部門フラグに頼らない");
});

test("Evidence-less structured results (growthDrivers/bottlenecks/companies, especially Company Candidates) are excluded from confirmed output", () => {
  const engine = read(`${dir}/engine.ts`);
  assert.match(engine, /function withEvidence/);
  assert.match(engine, /withEvidence\(companies,/);
  assert.match(engine, /Evidenceなしのため確定候補から除外/);
});

test("Reliability auto-promotion to PRIMARY is limited to official regulatory domains (sec.gov / *.gov); no ir./investors. host-prefix heuristic", () => {
  const evidence = read(`${dir}/evidence.ts`);
  assert.doesNotMatch(evidence, /\(ir\|investors?\)/, "host名の接頭辞だけでPRIMARYへ昇格させない");
  assert.match(evidence, /host === "sec\.gov" \|\| host\.endsWith\("\.sec\.gov"\) \|\| host\.endsWith\("\.gov"\)/);
});

test("Interactive Research POST reuses the existing Execution Store idempotency infrastructure (no second idempotency store)", () => {
  const route = read("app/api/company/research/route.ts");
  assert.match(route, /getExecutionStore/);
  assert.match(route, /getIdempotencyResult\("research-intelligence-ask"/);
  assert.match(route, /claimIdempotency\("research-intelligence-ask"/);
  assert.match(route, /completeIdempotency\("research-intelligence-ask"/);
  assert.match(route, /isSameOriginMutation/);
});

test("An overall request deadline spans classification, search, synthesis, save and knowledge capture, reusing withinRuntimeBudget (no new runtime)", () => {
  const service = read(`${dir}/service.ts`);
  assert.match(service, /export const REQUEST_DEADLINE_MS/);
  assert.match(service, /withinRuntimeBudget/);
  assert.match(service, /deadlineAt/);
  assert.match(service, /shouldCaptureKnowledge\(artifact, previous\)/);
  const engine = read(`${dir}/engine.ts`);
  assert.match(engine, /deadlineAt\?: number/);
  assert.match(engine, /withinRuntimeBudget/);
  for (const [file, source] of intelligence) assert.doesNotMatch(source, /setInterval|new Worker|child_process/, `${file} must not introduce a new runtime`);
});
