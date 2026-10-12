import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";

const dist = process.env.FUND_DIST;
const { buildShortTermAssessment } = await import(path.join(dist, "intel/investing/intelligence/horizon/shortScore.js"));
const { buildMidTermAssessment } = await import(path.join(dist, "intel/investing/intelligence/horizon/midScore.js"));
const { buildLongTermAssessment } = await import(path.join(dist, "intel/investing/intelligence/horizon/longScore.js"));
const { deriveTripleGate } = await import(path.join(dist, "intel/investing/intelligence/horizon/tripleGate.js"));

const NOW = new Date("2026-09-27T00:00:00Z");

function opportunity(overrides = {}) {
  return {
    id: "opp_test", ticker: "NVDA", name: "NVIDIA", theme: "AI", gate: "WAIT", score: 60,
    scoreCoverage: 60, coverage: 0.6, mandatoryEvidence: [], missingEvidence: [], riskFlags: [],
    breakdown: [
      { key: "futureDemand", label: "Future Demand", weight: 20, score: 16, reason: "demand" },
      { key: "volume", label: "Volume", weight: 15, score: 10, reason: "volume" },
      { key: "earningsGrowth", label: "Earnings Growth", weight: 15, score: 12, reason: "growth" },
      { key: "quality", label: "Quality", weight: 10, score: 8, reason: "fcf" },
      { key: "sectorStrength", label: "Sector Strength", weight: 10, score: 7, reason: "sector" },
      { key: "catalyst", label: "Catalyst", weight: 10, score: 9, reason: "catalyst" },
      { key: "valuation", label: "Valuation", weight: 10, score: null, reason: "no valuation engine" },
      { key: "macroFit", label: "Macro Fit", weight: 5, score: 5, reason: "RISK_ON" },
      { key: "portfolioFit", label: "Portfolio Fit", weight: 5, score: null, reason: "n/a" },
    ],
    relativeVolume: 1.5, priceChangePct: 2, catalyst: null, whyNow: "", portfolioImpact: "",
    portfolioAction: "WATCH",
    scenarios: [
      { kind: "BULL", trigger: "demand confirms", evidenceIds: ["e1"], whatToWatch: "RVOL", invalidation: "demand reverses", portfolioImpact: "" },
      { kind: "BASE", trigger: "steady", evidenceIds: ["e1"], whatToWatch: "regime", invalidation: "regime worsens", portfolioImpact: "" },
      { kind: "BEAR", trigger: "selloff", evidenceIds: ["e1"], whatToWatch: "lows", invalidation: "demand recovers", portfolioImpact: "" },
    ],
    evidence: [{ id: "e1", sourceType: "news", sourceName: "Reuters", sourceUrl: "https://reuters.com/a", publishedAt: "2026-09-26", fetchedAt: "2026-09-27T00:00:00Z", fact: "demand", metric: "news:future_demand", value: "positive", freshness: "daily" }],
    missingData: [], generatedAt: NOW.toISOString(),
    ...overrides,
  };
}

function uptrendBars(length = 205) {
  return Array.from({ length }, (_, index) => ({ date: `bar-${index}`, open: 100 + index * 0.5, high: 101 + index * 0.5, low: 99 + index * 0.5, close: 100 + index * 0.5, volume: 1_000_000 + (index === length - 1 ? 2_000_000 : 0) }));
}

function flatBars(length = 205) {
  return Array.from({ length }, (_, index) => ({ date: `bar-${index}`, open: 100, high: 101, low: 99, close: 100, volume: 500_000 }));
}

// ── Horizon Independence ───────────────────────────────────────────────────
test("SHORT/MID/LONG assessments are independent and carry their own horizon label and factor set", () => {
  const opp = opportunity();
  const bars = uptrendBars();
  const short = buildShortTermAssessment(opp, bars, bars, NOW);
  const mid = buildMidTermAssessment(opp, bars, bars, NOW);
  const long = buildLongTermAssessment(opp, undefined, NOW);
  assert.equal(short.horizon, "SHORT");
  assert.equal(mid.horizon, "MID");
  assert.equal(long.horizon, "LONG");
  assert.notDeepEqual(short.factors.map((f) => f.key), mid.factors.map((f) => f.key));
  assert.notDeepEqual(mid.factors.map((f) => f.key), long.factors.map((f) => f.key));
});

// ── Missing Data != 0 ───────────────────────────────────────────────────────
test("missing factors are null, not zero, at every horizon", () => {
  const opp = opportunity({ relativeVolume: null, breakdown: [] });
  const short = buildShortTermAssessment(opp, null, null, NOW);
  for (const factor of short.factors) if (!factor.known) { assert.equal(factor.score, null); assert.equal(factor.weightedScore, null); }
  assert.ok(short.factors.some((f) => f.key === "relativeVolume" && f.score === null));

  const mid = buildMidTermAssessment(opp, null, null, NOW);
  assert.equal(mid.factors.find((f) => f.key === "revisionGuidance").score, null, "Revision/Guidance has no provider and must stay null");

  const long = buildLongTermAssessment(opp, undefined, NOW);
  assert.equal(long.factors.find((f) => f.key === "competitiveAdvantage").score, null);
  assert.equal(long.factors.find((f) => f.key === "balanceSheet").score, null);
  assert.equal(long.factors.find((f) => f.key === "valuation").score, null);
});

// ── Coverage ────────────────────────────────────────────────────────────────
test("coverage equals the weight share of known factors, not a guessed fraction", () => {
  const opp = opportunity();
  const long = buildLongTermAssessment(opp, undefined, NOW);
  const knownWeight = long.factors.filter((f) => f.known).reduce((sum, f) => sum + f.weight, 0);
  assert.equal(long.coverage, Math.round((knownWeight / 100) * 100) / 100);
});

// ── Critical Risk blocks GO ─────────────────────────────────────────────────
test("a critical risk flag blocks GO_CANDIDATE even with a high score", () => {
  const strongBreakdown = [
    { key: "futureDemand", label: "", weight: 20, score: 20, reason: "" },
    { key: "volume", label: "", weight: 15, score: 15, reason: "" },
    { key: "earningsGrowth", label: "", weight: 15, score: 15, reason: "" },
    { key: "quality", label: "", weight: 10, score: 10, reason: "" },
    { key: "sectorStrength", label: "", weight: 10, score: 10, reason: "" },
    { key: "catalyst", label: "", weight: 10, score: 10, reason: "" },
    { key: "macroFit", label: "", weight: 5, score: 5, reason: "" },
  ];
  const opp = opportunity({ breakdown: strongBreakdown, missingEvidence: [], riskFlags: [{ code: "LOW_LIQUIDITY", severity: "critical", detail: "too thin" }] });
  const bars = uptrendBars();
  const short = buildShortTermAssessment(opp, bars, bars, NOW);
  assert.notEqual(short.gate, "GO_CANDIDATE");
});

// ── DATA_INCOMPLETE ──────────────────────────────────────────────────────────
test("coverage below 80 percent or missing mandatory evidence yields DATA_INCOMPLETE, never a confident gate", () => {
  const opp = opportunity({ breakdown: [], missingEvidence: [] });
  const long = buildLongTermAssessment(opp, undefined, NOW);
  assert.equal(long.gate, "DATA_INCOMPLETE");
  const oppMissingEvidence = opportunity({ missingEvidence: ["fundamental"] });
  const bars = uptrendBars();
  const short = buildShortTermAssessment(oppMissingEvidence, bars, bars, NOW);
  assert.equal(short.gate, "DATA_INCOMPLETE");
});

// ── Triple Gate combinations ─────────────────────────────────────────────────
test("Triple Gate: TRIPLE_GO / MID_LONG_GO / SHORT_ONLY / LONG_ONLY / NO_GO / MIXED / DATA_INCOMPLETE", () => {
  assert.equal(deriveTripleGate("GO_CANDIDATE", "GO_CANDIDATE", "GO_CANDIDATE"), "TRIPLE_GO");
  assert.equal(deriveTripleGate("WAIT", "GO_CANDIDATE", "GO_CANDIDATE"), "MID_LONG_GO");
  assert.equal(deriveTripleGate("GO_CANDIDATE", "WAIT", "PASS"), "SHORT_ONLY");
  assert.equal(deriveTripleGate("PASS", "WAIT", "GO_CANDIDATE"), "LONG_ONLY");
  assert.equal(deriveTripleGate("WAIT", "PASS", "WAIT"), "NO_GO");
  assert.equal(deriveTripleGate("GO_CANDIDATE", "WAIT", "GO_CANDIDATE"), "MIXED");
  assert.equal(deriveTripleGate("DATA_INCOMPLETE", "GO_CANDIDATE", "GO_CANDIDATE"), "DATA_INCOMPLETE");
});

// ── PR-B Research Structure reuse (LONG) ─────────────────────────────────────
test("LONG reuses the existing MarketHypothesis/CompanyComparisonRow/BottleneckAssessment instead of a second pipeline", () => {
  const research = {
    marketHypotheses: [{ market: "AI", thesis: "AI demand confirmed", confidence: 0.8, supportingEvidenceRefs: ["e1"], contraryEvidenceRefs: [], whyNow: [], adoptionSignals: [], unknowns: [] }],
    companyComparisons: [{ theme: "AI", rows: [{ ticker: "NVDA", name: "NVIDIA", marketRole: null, themeExposure: ["AI"], causalDistance: 1, revenueGrowth: 25, epsGrowth: 20, grossMargin: null, operatingMargin: 40, fcf: 1000, roic: null, per: null, forwardPer: null, pbr: null, moat: null, criticalRisks: [], warningRisks: [], evidenceRefs: ["cmp1"], missingData: [] }], singleCompanyException: false, generatedAt: NOW.toISOString() }],
    bottlenecks: [{ bottleneck: "HBM constraint", demandDriver: "GPU", supplyConstraint: "limited", capacityConstraint: null, expansionLeadTime: null, supplierConcentration: null, barrierToEntry: null, substitutes: [], beneficiaryTickers: ["NVDA"], evidenceRefs: ["b1"], confidence: 0.6 }],
    causalLinks: [{ from: "AI", to: "NVDA", distance: 1, explanation: "", evidenceRefs: [], confidence: 0.8 }],
  };
  const long = buildLongTermAssessment(opportunity(), research, NOW);
  const demand = long.factors.find((f) => f.key === "futureDemandTam");
  assert.equal(demand.score, 80);
  assert.ok(demand.evidenceRefs.includes("e1"));
  const growth = long.factors.find((f) => f.key === "revenueEpsGrowth");
  assert.ok(growth.evidenceRefs.includes("cmp1"));
  const bottleneck = long.factors.find((f) => f.key === "structuralBottleneck");
  assert.equal(bottleneck.score, 60);
  assert.ok(bottleneck.evidenceRefs.includes("b1"));
  // causal distance 1 (Direct) keeps full confidence multiplier
  assert.ok(long.confidence !== null);
});

test("LONG falls back to the existing breakdown factor when no PR-B research row exists for the ticker", () => {
  const long = buildLongTermAssessment(opportunity(), undefined, NOW);
  const demand = long.factors.find((f) => f.key === "futureDemandTam");
  assert.equal(demand.score, 80); // rescaled from breakdown.futureDemand 16/20*100
});
