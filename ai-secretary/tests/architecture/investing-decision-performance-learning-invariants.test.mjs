import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
const read = (path) => fs.readFileSync(path, "utf8");

const PERFORMANCE_FILES = [
  "app/lib/investing/intelligence/decisionPerformance/types.ts",
  "app/lib/investing/intelligence/decisionPerformance/returns.ts",
  "app/lib/investing/intelligence/decisionPerformance/build.ts",
  "app/lib/investing/intelligence/decisionPerformance/summary.ts",
  "app/lib/investing/intelligence/decisionPerformance/segments.ts",
  "app/lib/investing/intelligence/decisionPerformance/loader.ts",
];
const LEARNING_FILES = [
  "app/lib/investing/intelligence/learning/types.ts",
  "app/lib/investing/intelligence/learning/stats.ts",
  "app/lib/investing/intelligence/learning/factorPerformance.ts",
  "app/lib/investing/intelligence/learning/learningCandidate.ts",
  "app/lib/investing/intelligence/learning/loader.ts",
];
const ALL_FILES = [...PERFORMANCE_FILES, ...LEARNING_FILES];

test("existing Decision Store is reused: no second Decision Store is created", () => {
  for (const path of ALL_FILES) {
    const source = read(path);
    assert.doesNotMatch(source, /saveVaultFile\(.*(decision|intelligence-decisions)/i, `${path} must not write a second decision store`);
  }
  const loader = read("app/lib/investing/intelligence/decisionPerformance/loader.ts");
  assert.match(loader, /loadInvestmentDecisions/, "must reuse the existing Decision Store loader");
  const types = read("app/lib/investing/intelligence/types.ts");
  assert.match(types, /shortTermSnapshot\?:/);
  assert.match(types, /ticker\?:\s*string/);
});

test("backward compatibility: InvestmentDecisionRecord keeps every existing field", () => {
  const types = read("app/lib/investing/intelligence/types.ts");
  for (const field of ["id:", "opportunityId:", "decision:", "priceAtDecision:", "marketRegime:", "opportunityScore:", "scenario:", "timestamp:"]) {
    assert.match(types, new RegExp(field.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), `InvestmentDecisionRecord must keep existing field ${field}`);
  }
});

test("No X Dependency: Decision Performance and Learning never import note/X/content modules", () => {
  for (const path of ALL_FILES) {
    const source = read(path);
    assert.doesNotMatch(source, /from\s+["'].*\/(note|content|instagram)\//, `${path} must not import note/content/instagram modules`);
    assert.doesNotMatch(source, /xBridge|learningBrief|researchProjection|Buffer|DailyX/, `${path} must not reference the X/note bridge`);
  }
});

test("No Broker / No Auto Trade: no file describes an execution path", () => {
  for (const path of ALL_FILES) {
    const source = read(path);
    assert.doesNotMatch(source, /placeOrder|autoBuy|autoSell|broker\.execute|executeTrade|positionSize|orderType/i, `${path} must not describe an execution path`);
  }
});

test("Weight Change Safety: no code path applies a Learning Candidate to a scoring weight table", () => {
  for (const path of [...LEARNING_FILES, "app/lib/investing/intelligence/horizon/shortScore.ts", "app/lib/investing/intelligence/horizon/midScore.ts", "app/lib/investing/intelligence/horizon/longScore.ts"]) {
    const source = read(path);
    assert.doesNotMatch(source, /SHORT_SCORE_WEIGHTS\s*\[.*\]\s*=|MID_SCORE_WEIGHTS\s*\[.*\]\s*=|LONG_SCORE_WEIGHTS\s*\[.*\]\s*=/, `${path} must never assign into a weight table`);
    assert.doesNotMatch(source, /applyLearningCandidate|applyWeightChange|updateWeight\(/i, `${path} must not expose an apply function`);
  }
  const candidateTypes = read("app/lib/investing/intelligence/learning/types.ts");
  assert.match(candidateTypes, /requiresHumanReview:\s*true/);
  const horizonFiles = ["app/lib/investing/intelligence/horizon/shortScore.ts", "app/lib/investing/intelligence/horizon/midScore.ts", "app/lib/investing/intelligence/horizon/longScore.ts"];
  for (const path of horizonFiles) assert.doesNotMatch(read(path), /from\s+["'].*\/learning\//, `${path} must not depend on the Learning module (one-way dependency only)`);
});

test("No Look-Ahead: Research/Horizon modules never import Decision Performance or Learning (future data can measure outcomes, never feed back into scoring)", () => {
  const upstreamFiles = [
    "app/lib/investing/intelligence/research/orchestrator.ts",
    "app/lib/investing/intelligence/horizon/shared.ts",
    "app/lib/investing/intelligence/horizon/shortScore.ts",
    "app/lib/investing/intelligence/horizon/midScore.ts",
    "app/lib/investing/intelligence/horizon/longScore.ts",
    "app/lib/investing/intelligence/research.ts",
  ];
  for (const path of upstreamFiles) {
    const source = read(path);
    assert.doesNotMatch(source, /decisionPerformance\/|\/learning\/(?!brief)/, `${path} must not depend on decisionPerformance/ or learning/`);
  }
});

test("Decision Snapshot is captured verbatim at decision time, never recomputed by the decision route", () => {
  const route = read("app/api/investing/opportunities/[id]/decision/route.ts");
  assert.match(route, /shortTermSnapshot:\s*opportunity\.shortTerm/);
  assert.doesNotMatch(route, /buildShortTermAssessment|buildMidTermAssessment|buildLongTermAssessment|deriveMarketRegime/, "the decision route must copy the already-computed snapshot, never recompute it");
});

test("Production/Secrets/env/Cron surfaces are untouched by Decision Performance / Learning", () => {
  for (const path of ["app/lib/investing/intelligence/cron.ts", "app/lib/investing/intelligence/flags.ts", "vercel.json"]) {
    const source = read(path);
    assert.doesNotMatch(source, /decisionPerformance\/|learning\/factorPerformance|InvestmentLearningCandidate|DecisionPerformanceReport/, `${path} must not reference the new Decision Performance / Learning modules`);
  }
});
