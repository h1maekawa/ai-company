import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");
const learningFiles = [
  "app/lib/fund/learning/types.ts",
  "app/lib/fund/learning/engine.ts",
  "app/lib/fund/learning/store.ts",
];

test("Investment Decision Learning files exist", () => {
  for (const file of learningFiles) assert.ok(fs.existsSync(path.join(ROOT, file)), file);
});

test("【重要】Human ACCEPT APIは記録専用で証券注文へ接続しない", () => {
  const route = read("app/api/fund/decisions/route.ts");
  assert.match(route, /assertProductionMutationAllowed/);
  assert.match(route, /claimIdempotency/);
  assert.match(route, /confirmedByHuman/);
  assert.doesNotMatch(route, /placeOrder|submitOrder|executeTrade|INVESTMENT_TRADE/);
  assert.doesNotMatch(route, /actionGateway|executorRegistry|executeAction/);
});

test("【重要】Decision Outcomeは価格ObservationでRealized P/Lではない", () => {
  const types = read("app/lib/fund/learning/types.ts");
  const route = read("app/api/fund/outcomes/route.ts");
  assert.match(types, /metricKind: "PRICE_OBSERVATION"/);
  assert.doesNotMatch(types, /realizedProfit|realizedPnl|taxAfterProfit/i);
  assert.match(route, /assertProductionMutationAllowed/);
  assert.match(route, /claimIdempotency/);
});

test("【重要】Investment LearningはCandidateとHuman Approvalを分離する", () => {
  const engine = read("app/lib/fund/learning/engine.ts");
  const types = read("app/lib/fund/learning/types.ts");
  const route = read("app/api/fund/learning/route.ts");
  assert.match(engine, /status: "candidate"/);
  assert.match(engine, /observation:/);
  assert.match(engine, /interpretation:/);
  assert.match(types, /confirmedByHuman: true/);
  assert.match(route, /confirmedByHuman !== true/);
});

test("【重要】Approved LearningもFund PolicyやRecommendationを自動変更しない", () => {
  for (const file of learningFiles) {
    const source = read(file);
    assert.doesNotMatch(source, /savePolicy|DEFAULT_POLICY\s*=|evaluate\(/,
      `${file} がPolicyまたはRecommendationを変更しています`);
  }
  assert.doesNotMatch(read("app/lib/fund/engine.ts"), /investmentLearning|approvedLearning/);
});

test("【重要】Holdings DiffからHuman Decisionを推測しない", () => {
  const source = read("app/lib/fund/holdingsDiff.ts");
  assert.doesNotMatch(source, /appendDecision|HumanDecisionDisposition|ACCEPT|REJECT/);
});

test("Fund Review APIはRecommendation・Decision・Outcome・Learningを統合する", () => {
  const route = read("app/api/fund/reviews/route.ts");
  for (const required of [
    "loadRecommendations", "loadDecisions", "loadDecisionOutcomes",
    "effectiveInvestmentLearnings", "buildInvestmentDecisionReviews",
  ]) assert.match(route, new RegExp(required));
});

test("Human Decision / Outcome / Learningの監査レコードはAppend Only", () => {
  const decisionStore = read("app/lib/fund/store.ts");
  const learningStore = read("app/lib/fund/learning/store.ts");
  assert.match(decisionStore, /const next = \[stored, \.\.\.list\];/);
  assert.doesNotMatch(learningStore, /list\[\w+\]\s*=/);
  assert.match(learningStore, /const next = \[record, \.\.\.list\]/);
});

test("既存investment-logはlegacy narrative logとして残す", () => {
  const source = read("app/api/fund/log/route.ts");
  assert.match(source, /legacy narrative log/);
  assert.match(source, /investment-log/);
});

test("【重要】既存の金融Human-Only境界を維持する", () => {
  const engine = read("app/lib/fund/engine.ts");
  const actions = read("app/lib/company/execution/actionTypes.ts");
  assert.match(engine, /executionAuthority: "HUMAN_ONLY"/);
  assert.match(engine, /aiExecutionAllowed: false/);
  assert.match(actions, /INVESTMENT_TRADE:\s*"R4"/);
});
