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
  assert.match(engine, /allowlist\.has\(claimed\)/);
  assert.match(engine, /URLは書かないこと/);
});
