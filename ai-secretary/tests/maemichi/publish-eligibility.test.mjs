import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";

const DIST = process.env.MAEMICHI_DIST;
const gate = await import(path.join(DIST, "note/automation/publishEligibility.js"));
const base = { id: "d", planId: "p", planSlotId: "s", xAccountId: "a", purpose: "reach", genreId: "ai", text: "AIを使う前に、目的を一文で決めると迷いが減ります。", urls: [], needsDisclosure: false, status: "draft", similarityScore: 0.1, createdAt: "2026-10-07T00:00:00Z", updatedAt: "2026-10-07T00:00:00Z" };
const input = (draft = base, overrides = {}) => ({ draft, currentPlanId: "p", currentPlanSlotId: "s", brand: { personality: { avoidedExpressions: [] } }, experiences: [], researchItems: [], researchProviderFailureUnresolved: false, ...overrides });

test("current plan/slot lineageがない既存draft/approvedはauto publishしない", async () => {
  const result = await gate.evaluatePublishEligibility(input({ ...base, status: "approved", planId: undefined, planSlotId: undefined }));
  assert.equal(result.eligible, false);
  assert.match(result.reasons.join(" "), /current DailyX Plan\/slot/);
});

test("Safety/length/similarity/failure/source gateをすべてpublish前に要求する", async () => {
  const draft = { ...base, text: "市場は前年比20%成長した", similarityScore: 0.9, failureReason: "generation failed" };
  const result = await gate.evaluatePublishEligibility(input(draft));
  assert.equal(result.eligible, false);
  assert.match(result.reasons.join(" "), /failureReason/);
  assert.match(result.reasons.join(" "), /類似度/);
  assert.match(result.reasons.join(" "), /source\/evidence/);
});

test("RESEARCH_PROVIDER_FAILURE中はinvestmentを止め、低リスク投稿は通す", async () => {
  const investment = await gate.evaluatePublishEligibility(input({ ...base, genreId: "asset-building", text: "投資の判断は急がず確認する。" }, { researchProviderFailureUnresolved: true }));
  const lowRisk = await gate.evaluatePublishEligibility(input(base, { researchProviderFailureUnresolved: true }));
  assert.equal(investment.eligible, false);
  assert.equal(lowRisk.eligible, true);
});

test("最新Research Runが成功なら過去のprovider failureは解消扱い", () => {
  const runs = [
    { departmentId: "creator", startedAt: "2026-10-06T00:00:00Z", failedSources: ["web"], status: "FAILED" },
    { departmentId: "creator", startedAt: "2026-10-07T00:00:00Z", failedSources: [], successfulSources: ["web"], status: "COMPLETED" },
  ];
  assert.equal(gate.hasUnresolvedResearchProviderFailure(runs), false);
});

test("Canary候補はnon-investment・低source依存・Brand適合を優先する", () => {
  const cluster = (id, genreIds, sourceCount, brandFitScore) => ({ id, genreIds, sourceCount, brandFitScore, totalScore: 80 });
  const sorted = gate.prioritizeCanaryCandidates([cluster("investment", ["asset-building"], 1, 25), cluster("many", ["ai"], 5, 25), cluster("safe", ["ai"], 1, 25)]);
  assert.equal(sorted[0].id, "safe");
  assert.equal(sorted.at(-1).id, "investment");
});
