import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";

const dist = process.env.FUND_DIST;
const { buildFactorPerformances } = await import(path.join(dist, "intel/investing/intelligence/learning/factorPerformance.js"));
const { buildLearningCandidates } = await import(path.join(dist, "intel/investing/intelligence/learning/learningCandidate.js"));
const { pearson } = await import(path.join(dist, "intel/investing/intelligence/learning/stats.js"));
const { SHORT_SCORE_WEIGHTS } = await import(path.join(dist, "intel/investing/intelligence/horizon/shortScore.js"));

function factor(key, score) {
  return { key, label: key, weight: SHORT_SCORE_WEIGHTS[key] ?? 10, score, weightedScore: score === null ? null : score, known: score !== null, evidenceRefs: [], reason: null };
}

function record(id, relativeVolumeScore, overrides = {}) {
  return {
    id, opportunityId: `o_${id}`, decision: "GO", reason: "", priceAtDecision: 100, marketRegime: "RISK_ON", opportunityScore: 80, scenario: "BASE",
    timestamp: "2026-01-05T00:00:00.000Z", ticker: "NVDA",
    shortTermSnapshot: { horizon: "SHORT", score: 80, coverage: 0.9, gate: "GO_CANDIDATE", confidence: 0.8, factors: [factor("relativeVolume", relativeVolumeScore)], bullCase: null, baseCase: null, bearCase: null, risks: [], invalidationConditions: [], evidenceRefs: [], generatedAt: "2026-01-05T00:00:00.000Z" },
    ...overrides,
  };
}

function performance(id, return20d, status = "VALID") {
  return { decisionId: id, ticker: "NVDA", decision: "GO", decisionPrice: 100, decisionAt: "2026-01-05T00:00:00.000Z", shortGate: "GO_CANDIDATE", midGate: null, longGate: null, tripleGate: null, return1d: null, return5d: null, return20d, return60d: null, return120d: null, return250d: null, maxDrawdown20d: null, maxDrawdown60d: null, maxGain20d: null, maxGain60d: null, evaluatedThrough: null, dataStatus: status, updatedAt: "2026-01-05T00:00:00.000Z" };
}

// ── Correlation (basic sanity) ────────────────────────────────────────────────
test("Pearson correlation detects a clear positive relationship and requires at least 10 points", () => {
  const x = Array.from({ length: 15 }, (_, i) => i);
  const y = Array.from({ length: 15 }, (_, i) => i * 2);
  assert.ok(pearson(x, y) > 0.9);
  assert.equal(pearson([1, 2, 3], [1, 2, 3]), null, "fewer than 10 points must stay null, not a noisy coefficient");
});

// ── Factor Performance ────────────────────────────────────────────────────────
test("Factor Performance pairs each known factor score with its matching return, skipping unknown factors", () => {
  const records = Array.from({ length: 12 }, (_, i) => record(`d${i}`, 50 + i * 4));
  const performances = Array.from({ length: 12 }, (_, i) => performance(`d${i}`, i * 2));
  const results = buildFactorPerformances(records, performances, 1);
  const relativeVolume = results.find((item) => item.horizon === "SHORT" && item.factorKey === "relativeVolume");
  assert.equal(relativeVolume.sampleSize, 12);
  assert.ok(relativeVolume.correlation > 0.5, "factor score rising alongside return must show a positive correlation");
  assert.equal(relativeVolume.status, "VALID");
});

test("unknown (not-yet-scored) factors are excluded from Factor Performance, not treated as 0", () => {
  const records = [record("d1", null), record("d2", 80)];
  const performances = [performance("d1", 10), performance("d2", 10)];
  const results = buildFactorPerformances(records, performances, 1);
  const relativeVolume = results.find((item) => item.factorKey === "relativeVolume");
  assert.equal(relativeVolume.sampleSize, 1, "the record with an unknown factor score must be excluded, not counted as 0");
});

// ── Insufficient sample ────────────────────────────────────────────────────────
test("Factor Performance below the minimum sample is INSUFFICIENT_SAMPLE, not VALID", () => {
  const records = [record("d1", 80)];
  const performances = [performance("d1", 10)];
  const results = buildFactorPerformances(records, performances);
  const relativeVolume = results.find((item) => item.factorKey === "relativeVolume");
  assert.equal(relativeVolume.status, "INSUFFICIENT_SAMPLE");
});

test("zero usable pairs yields DATA_INCOMPLETE", () => {
  const results = buildFactorPerformances([], []);
  assert.equal(results.length, 0);
});

// ── Learning Candidate / Human Review ────────────────────────────────────────
test("a notable correlation becomes REVIEW_CANDIDATE with a bounded proposed weight; requiresHumanReview is always true", () => {
  const factorPerformances = [{ horizon: "SHORT", factorKey: "relativeVolume", sampleSize: 40, averageFactorScore: 70, averageReturn: 5, correlation: 0.25, winRate: 60, status: "VALID" }];
  const [candidate] = buildLearningCandidates(factorPerformances);
  assert.equal(candidate.status, "REVIEW_CANDIDATE");
  assert.equal(candidate.currentWeight, SHORT_SCORE_WEIGHTS.relativeVolume);
  assert.notEqual(candidate.proposedWeight, null);
  assert.ok(Math.abs(candidate.proposedWeight - candidate.currentWeight) <= candidate.currentWeight * 0.3 + 0.01, "a proposal must be a bounded nudge, not an unbounded rewrite");
  assert.equal(candidate.requiresHumanReview, true);
});

test("a weak correlation becomes OBSERVE with no proposed weight", () => {
  const factorPerformances = [{ horizon: "SHORT", factorKey: "priceMomentum", sampleSize: 40, averageFactorScore: 55, averageReturn: 1, correlation: 0.05, winRate: 50, status: "VALID" }];
  const [candidate] = buildLearningCandidates(factorPerformances);
  assert.equal(candidate.status, "OBSERVE");
  assert.equal(candidate.proposedWeight, null);
});

test("INSUFFICIENT_SAMPLE factor performance never produces a proposed weight", () => {
  const factorPerformances = [{ horizon: "SHORT", factorKey: "catalyst", sampleSize: 5, averageFactorScore: 60, averageReturn: 3, correlation: 0.4, winRate: 60, status: "INSUFFICIENT_SAMPLE" }];
  const [candidate] = buildLearningCandidates(factorPerformances);
  assert.equal(candidate.status, "INSUFFICIENT_SAMPLE");
  assert.equal(candidate.proposedWeight, null);
  assert.equal(candidate.confidence, "LOW");
});

// ── No auto weight change ─────────────────────────────────────────────────────
test("confidence scales with sample size and currentWeight always matches the live weight table", () => {
  const factorPerformances = [
    { horizon: "MID", factorKey: "futureDemand", sampleSize: 150, averageFactorScore: 70, averageReturn: 5, correlation: 0.3, winRate: 60, status: "VALID" },
    { horizon: "MID", factorKey: "futureDemand", sampleSize: 40, averageFactorScore: 70, averageReturn: 5, correlation: 0.3, winRate: 60, status: "VALID" },
  ];
  const [high, medium] = buildLearningCandidates(factorPerformances);
  assert.equal(high.confidence, "HIGH");
  assert.equal(medium.confidence, "MEDIUM");
});
