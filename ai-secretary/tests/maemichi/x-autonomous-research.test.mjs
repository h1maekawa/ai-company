import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";

const root = process.env.MAEMICHI_DIST;
const plan = await import(path.join(root, "note/automation/dailyXPlan.js"));
const agenda = await import(path.join(root, "note/automation/dailyResearchAgenda.js"));
const readiness = await import(path.join(root, "note/automation/threePostReadiness.js"));
const types = await import(path.join(root, "note/research/types.js"));

const cluster = (id, hotScore, hotConfidence = "HIGH", overrides = {}) => ({
  id, title: id, summary: `${id} summary`, genreIds: ["ai"], researchItemIds: [`r-${id}`], sourceCount: 2,
  firstDetectedAt: "2026-10-09T00:00:00.000Z", lastDetectedAt: "2026-10-10T00:00:00.000Z",
  trendScore: 20, brandFitScore: 20, experienceFitScore: 10, monetizationFitScore: 5,
  originalityScore: 12, totalScore: hotScore, hotScore, hotConfidence,
  hotScoreBreakdown: { momentum: 10, freshness: 10, crossSourceEvidence: 10, brandFit: 10, ownPerformanceFit: null, originality: 10, repetitionPenalty: 0, availableWeight: 60, measuredPostCount: 0 },
  penalties: [], blocked: false, matchedExperienceIds: [], status: "candidate", ...overrides,
});

const policy = (overrides = {}) => ({
  departmentId: "creator", enabled: true, researcherAgentId: "creator-research", topics: [], sourceTypes: ["web"],
  maxQueriesPerRun: 8, maxItemsPerRun: 40, maxRuntimeMs: 45_000, freshnessHours: 72,
  autoKnowledgeCandidate: true, ...overrides,
});

test("maxXPostsPerDay=3 produces fixed 07:30/12:15/20:30 reach/trust/depth slots", () => {
  const built = plan.buildDailyXPlan({
    date: "2026-10-10", accountKey: "primary", now: new Date("2026-10-09T23:00:00Z"),
    strategy: types.defaultContentGrowthStrategy(), maxXPostsPerDay: 3,
    candidates: [cluster("a", 90), cluster("b", 80), cluster("c", 70)],
  });
  assert.deepEqual(built.slots.map((slot) => slot.scheduledTime), ["07:30", "12:15", "20:30"]);
  assert.deepEqual(built.slots.map((slot) => slot.operationRole), ["reach", "trust", "depth"]);
  assert.equal(new Set(built.slots.map((slot) => slot.candidateRef.id)).size, 3);
});

test("slot selection prefers existing evidence dimensions without creating a parallel score", () => {
  const candidates = [
    cluster("fresh", 75, "HIGH", { hotScoreBreakdown: { ...cluster("x", 1).hotScoreBreakdown, freshness: 15, momentum: 14 } }),
    cluster("trusted", 90, "HIGH", { brandFitScore: 25, originalityScore: 15 }),
    cluster("personal", 85, "HIGH", { matchedExperienceIds: ["exp-1"], monetizationFitScore: 12 }),
  ];
  const strategy = types.defaultContentGrowthStrategy();
  assert.equal(plan.orderCandidatesForSlot(candidates, "reach", strategy, false)[0].id, "fresh");
  assert.equal(plan.orderCandidatesForSlot(candidates, "trust", strategy, false)[0].id, "trusted");
  assert.equal(plan.orderCandidatesForSlot(candidates, "depth", strategy, false)[0].id, "personal");
});

test("Daily Research Agenda respects immutable query budget and follows unresolved evidence gap", () => {
  const researchPolicy = policy({ maxQueriesPerRun: 5 });
  const before = structuredClone(researchPolicy);
  const built = agenda.buildCreatorDailyResearchAgenda({
    date: "2026-10-10", now: new Date("2026-10-09T23:00:00Z"), policy: researchPolicy,
    researchArtifacts: [{
      id: "artifact-gap", topic: "AI", summary: "", researchItemIds: [], departmentContexts: { creator: "AI" }, usedBy: [], createdAt: "2026-10-09T00:00:00Z",
      intelligence: { topicKey: "ai", originalQuestion: "q", playbookId: "theme-research", primaryDepartment: "creator", depth: "standard", sections: [], facts: [], interpretation: [], unknowns: ["missing independent source"], asOf: "2026-10-09", ttlHours: 24, status: "PARTIAL", routingAssumption: "test" },
    }],
  });
  assert.ok(built.queryIntents.length <= 5);
  assert.ok(new Set(built.queryIntents.map((intent) => intent.category)).size > 1);
  assert.ok(built.queryIntents.some((intent) => intent.category === "knowledge-gap" && intent.evidenceRefs.includes("artifact-gap")));
  assert.deepEqual(researchPolicy, before, "Agenda/Learning input cannot mutate policy");
});

test("missing Performance remains UNKNOWN and never becomes observed zero", () => {
  const built = agenda.buildCreatorDailyResearchAgenda({ date: "2026-10-10", now: new Date(), policy: policy() });
  assert.ok(built.unknowns.some((value) => value.includes("ContentPerformance is UNKNOWN")));
  assert.equal(built.queryIntents.some((intent) => intent.reason.includes("0")), false);
});

test("LOW candidates are excluded and readiness explains fewer than three eligible posts", () => {
  const result = readiness.deriveThreePostReadiness({
    maxXPostsPerDay: 3,
    candidates: [cluster("high", 90, "HIGH"), cluster("low", 80, "LOW")],
    plan: null,
  });
  assert.equal(result.eligibleCandidateCount, 1);
  assert.equal(result.readyForThree, false);
  assert.ok(result.skipReasons.includes("ELIGIBLE_CANDIDATES_1_OF_3"));
});
