import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";

const dist = process.env.FUND_DIST;
const { findDecisionBarIndex, computeReturnAt, computeMaxDrawdownGain } = await import(path.join(dist, "intel/investing/intelligence/decisionPerformance/returns.js"));
const { buildDecisionPerformance } = await import(path.join(dist, "intel/investing/intelligence/decisionPerformance/build.js"));
const { buildDecisionPerformanceSummary } = await import(path.join(dist, "intel/investing/intelligence/decisionPerformance/summary.js"));
const { buildDecisionPerformanceSegments } = await import(path.join(dist, "intel/investing/intelligence/decisionPerformance/segments.js"));

const DECIDED_AT = "2026-01-05T00:00:00.000Z";

function bars(n, priceAt) {
  return Array.from({ length: n }, (_, i) => ({ date: new Date(Date.UTC(2026, 0, 5 + i)).toISOString().slice(0, 10), open: priceAt(i), high: priceAt(i) + 1, low: priceAt(i) - 1, close: priceAt(i), volume: 1_000_000 }));
}

function decision(overrides = {}) {
  return { id: "d1", opportunityId: "o1", decision: "GO", reason: "", priceAtDecision: 100, marketRegime: "RISK_ON", opportunityScore: 80, scenario: "BASE", timestamp: DECIDED_AT, ticker: "NVDA", ...overrides };
}

function horizonAssessment(gate, overrides = {}) {
  return { horizon: "SHORT", score: 80, coverage: 0.9, gate, confidence: 0.8, factors: [], bullCase: null, baseCase: null, bearCase: null, risks: [], invalidationConditions: [], evidenceRefs: [], generatedAt: DECIDED_AT, ...overrides };
}

// ── GO / WAIT / PASS outcome tracking ───────────────────────────────────────
test("GO, WAIT and PASS decisions are all tracked the same way (not just GO)", () => {
  const rising = bars(260, (i) => 100 + i * 0.5);
  for (const outcome of ["GO", "WAIT", "PASS"]) {
    const performance = buildDecisionPerformance(decision({ decision: outcome }), rising);
    assert.equal(performance.decision, outcome);
    assert.equal(performance.dataStatus, "VALID");
    assert.ok(performance.return20d > 0, `${outcome} must still measure what happened afterward`);
  }
});

// ── 1D/5D/20D returns ────────────────────────────────────────────────────────
test("return1d/5d/20d compute (price - decisionPrice)/decisionPrice as a percentage", () => {
  const flatThenJump = bars(30, (i) => (i === 0 ? 100 : i < 20 ? 100 : 110));
  const performance = buildDecisionPerformance(decision(), flatThenJump);
  assert.equal(performance.return1d, 0);
  assert.ok(performance.return20d > 0);
});

// ── 60D/120D/250D nullable when insufficient future data ────────────────────
test("return60d/120d/250d stay null (not 0) when that much time has not elapsed yet", () => {
  const onlyThirtyBars = bars(30, (i) => 100 + i);
  const performance = buildDecisionPerformance(decision(), onlyThirtyBars);
  assert.equal(performance.return60d, null);
  assert.equal(performance.return120d, null);
  assert.equal(performance.return250d, null);
  assert.notEqual(performance.return5d, null);
});

// ── Max drawdown / gain ──────────────────────────────────────────────────────
test("max drawdown and max gain are positive magnitudes measured within the window", () => {
  const dipThenRecover = bars(25, (i) => (i < 10 ? 100 - i : 90 + (i - 10) * 2));
  const { maxDrawdownPct, maxGainPct } = computeMaxDrawdownGain(dipThenRecover, 0, 100, 20);
  assert.ok(maxDrawdownPct > 0);
  assert.ok(maxGainPct >= 0);
  assert.ok(maxDrawdownPct > 0 && maxGainPct > 0, "both a drawdown and a later gain must be captured within the same window");
});

test("max drawdown/gain stay null when the window has not fully elapsed", () => {
  const { maxDrawdownPct, maxGainPct } = computeMaxDrawdownGain(bars(10, (i) => 100 + i), 0, 100, 20);
  assert.equal(maxDrawdownPct, null);
  assert.equal(maxGainPct, null);
});

// ── Missing decision price / missing ticker ──────────────────────────────────
test("a missing decisionPrice or ticker yields DATA_INCOMPLETE, never a guessed return", () => {
  const withBars = bars(260, (i) => 100 + i);
  assert.equal(buildDecisionPerformance(decision({ priceAtDecision: null }), withBars).dataStatus, "DATA_INCOMPLETE");
  assert.equal(buildDecisionPerformance(decision({ ticker: undefined }), withBars).dataStatus, "DATA_INCOMPLETE");
  assert.equal(buildDecisionPerformance(decision(), null).dataStatus, "DATA_INCOMPLETE");
  const incomplete = buildDecisionPerformance(decision({ priceAtDecision: null }), withBars);
  assert.equal(incomplete.return1d, null);
  assert.equal(incomplete.return250d, null);
});

test("pre-PR-E decision records (no snapshot) stay DATA_INCOMPLETE with null gates, not guessed", () => {
  const legacy = { id: "legacy1", opportunityId: "o1", decision: "GO", reason: "", priceAtDecision: null, marketRegime: "RISK_ON", opportunityScore: 80, scenario: "BASE", timestamp: DECIDED_AT };
  const performance = buildDecisionPerformance(legacy, bars(260, (i) => 100 + i));
  assert.equal(performance.dataStatus, "DATA_INCOMPLETE");
  assert.equal(performance.shortGate, null);
  assert.equal(performance.tripleGate, null);
});

// ── No look-ahead ────────────────────────────────────────────────────────────
test("decision-bar lookup never resolves to a bar before the decision date", () => {
  const series = bars(10, (i) => 100 + i);
  const index = findDecisionBarIndex(series, "2026-01-07T00:00:00.000Z");
  assert.ok(series[index].date >= "2026-01-07");
});

test("returns only use bars at or after the decision index, never earlier ones", () => {
  const series = bars(30, (i) => (i < 15 ? 50 : 150)); // a sharp move exists only before the decision index
  const decisionIndex = 15;
  const r = computeReturnAt(series, decisionIndex, 150, 5);
  assert.equal(r, 0, "price is flat after the decision; the earlier jump before it must not leak in");
});

// ── Decision Snapshot gates are carried through, never recomputed ───────────
test("shortGate/midGate/longGate/tripleGate are copied from the Decision Snapshot verbatim", () => {
  const record = decision({ shortTermSnapshot: horizonAssessment("GO_CANDIDATE"), midTermSnapshot: horizonAssessment("WAIT"), longTermSnapshot: horizonAssessment("PASS"), tripleGateSnapshot: "SHORT_ONLY" });
  const performance = buildDecisionPerformance(record, bars(260, (i) => 100 + i));
  assert.equal(performance.shortGate, "GO_CANDIDATE");
  assert.equal(performance.midGate, "WAIT");
  assert.equal(performance.longGate, "PASS");
  assert.equal(performance.tripleGate, "SHORT_ONLY");
});

// ── Statistics ────────────────────────────────────────────────────────────────
test("win rate, average/median return, expected value and risk/reward are computed from VALID samples only", () => {
  const performances = [
    { decisionId: "1", return20d: 10, maxDrawdown20d: 2, maxGain20d: 10, dataStatus: "VALID" },
    { decisionId: "2", return20d: -5, maxDrawdown20d: 5, maxGain20d: 1, dataStatus: "VALID" },
    { decisionId: "3", return20d: null, maxDrawdown20d: null, maxGain20d: null, dataStatus: "DATA_INCOMPLETE" },
  ];
  const summary = buildDecisionPerformanceSummary(performances, { returnField: "return20d", drawdownField: "maxDrawdown20d", gainField: "maxGain20d" }, 1);
  assert.equal(summary.sampleSize, 2);
  assert.equal(summary.winRate, 50);
  assert.equal(summary.averageReturn, 2.5);
  assert.equal(summary.medianReturn, 2.5);
  assert.equal(summary.expectedValue, summary.averageReturn);
  assert.equal(summary.averageMaxDrawdown, 3.5);
  assert.equal(summary.averageMaxGain, 5.5);
  assert.ok(summary.riskRewardRatio > 0);
  assert.equal(summary.status, "VALID");
});

test("insufficient sample is reported honestly, not silently treated as VALID", () => {
  const performances = [{ decisionId: "1", return20d: 10, maxDrawdown20d: 1, maxGain20d: 10, dataStatus: "VALID" }];
  const summary = buildDecisionPerformanceSummary(performances);
  assert.equal(summary.status, "INSUFFICIENT_SAMPLE");
  assert.equal(summary.sampleSize, 1);
});

test("zero decisions yields DATA_INCOMPLETE, not a zero-value summary", () => {
  const summary = buildDecisionPerformanceSummary([]);
  assert.equal(summary.status, "DATA_INCOMPLETE");
  assert.equal(summary.winRate, null);
  assert.equal(summary.averageReturn, null);
});

// ── Segmentation (Decision / Horizon / Triple Gate) ──────────────────────────
test("segments group by Decision, each Horizon gate, and Triple Gate", () => {
  const performances = [
    { decisionId: "1", decision: "GO", shortGate: "GO_CANDIDATE", midGate: "WAIT", longGate: "PASS", tripleGate: "SHORT_ONLY", return20d: 10, maxDrawdown20d: 1, maxGain20d: 10, dataStatus: "VALID" },
    { decisionId: "2", decision: "WAIT", shortGate: "WAIT", midGate: "WAIT", longGate: "PASS", tripleGate: "NO_GO", return20d: -3, maxDrawdown20d: 3, maxGain20d: 1, dataStatus: "VALID" },
  ];
  const segments = buildDecisionPerformanceSegments(performances);
  assert.ok(segments.byDecision.GO);
  assert.ok(segments.byDecision.WAIT);
  assert.ok(segments.byShortGate.GO_CANDIDATE);
  assert.ok(segments.byTripleGate.SHORT_ONLY);
  assert.ok(segments.byTripleGate.NO_GO);
});
