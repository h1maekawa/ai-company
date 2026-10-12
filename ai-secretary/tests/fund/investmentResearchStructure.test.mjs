import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";

const dist = process.env.FUND_DIST;
const { buildMarketHypothesis, marketHypothesisToArtifact } = await import(path.join(dist, "intel/investing/intelligence/research/marketHypothesis.js"));
const { buildMarketStructure, THEME_MARKET_ROLE, marketStructureRoleOf } = await import(path.join(dist, "intel/investing/intelligence/research/marketStructure.js"));
const { buildPicksAndShovelsBeneficiaries } = await import(path.join(dist, "intel/investing/intelligence/research/picksAndShovels.js"));
const { buildBottleneckAssessments } = await import(path.join(dist, "intel/investing/intelligence/research/bottleneck.js"));
const { buildCausalLinks } = await import(path.join(dist, "intel/investing/intelligence/research/causalDistance.js"));
const { buildCandidateShortlist } = await import(path.join(dist, "intel/investing/intelligence/research/candidateDiscovery.js"));
const { buildCompanyComparisonRows } = await import(path.join(dist, "intel/investing/intelligence/research/companyComparison.js"));
const { buildInvestmentResearchBundle } = await import(path.join(dist, "intel/investing/intelligence/research/orchestrator.js"));
const { THEME_UNIVERSE } = await import(path.join(dist, "intel/investing/intelligence/themes.js"));
const { buildThemeGraph } = await import(path.join(dist, "intel/investing/intelligence/themeIntelligence.js"));

const NOW = new Date("2026-09-27T00:00:00Z");

function newsItem(overrides) {
  return {
    id: "n1", title: "", source: "Reuters", url: "https://reuters.com/a",
    publishedAt: "2026-09-26", fetchedAt: "2026-09-27T00:00:00Z",
    factSummary: "AI demand increased", interpretation: null, impact: "positive",
    impacts: [], trustTier: "TIER_2",
    relatedSectors: [], relatedThemes: ["AI"], relatedTickers: [], freshness: "daily",
    ...overrides,
  };
}

function candidate(overrides) {
  return { ticker: "NVDA", name: "NVIDIA", held: false, watchlisted: false, themes: ["AI"], sectors: [], aliases: [], candidateSources: ["watchlist"], ...overrides };
}

function opportunity(overrides) {
  return {
    id: "opp_test", ticker: "NVDA", name: "NVIDIA", theme: "AI", gate: "WAIT", score: 60,
    scoreCoverage: 60, coverage: 0.6, mandatoryEvidence: [], missingEvidence: [], riskFlags: [], breakdown: [],
    relativeVolume: null, priceChangePct: null, catalyst: null, whyNow: "", portfolioImpact: "",
    portfolioAction: "WATCH", scenarios: [], evidence: [], missingData: [], generatedAt: NOW.toISOString(),
    ...overrides,
  };
}

// ── Fact Classification Test ────────────────────────────────────────────
test("Market Hypothesis classifies facts, interpretations, hypotheses and unknowns separately", () => {
  const news = [newsItem({ id: "d1", factSummary: "AI capex demand increased", impacts: [{ targetType: "theme", targetId: "AI", direction: "positive", confidence: 0.9, rationale: "capex demand", evidenceIds: ["d1"], role: "future_demand" }] })];
  const hypothesis = buildMarketHypothesis("AI", news, NOW);
  assert.ok(hypothesis.supportingEvidenceRefs.length > 0);
  const artifact = marketHypothesisToArtifact(hypothesis, NOW);
  assert.ok(artifact.facts.length > 0);
  assert.ok(artifact.hypotheses.length === 1);
  assert.ok(artifact.hypotheses[0].confirmingEvidenceIds.length > 0);
  assert.equal(artifact.subjectType, "MARKET");
});

// ── Unknown Test ─────────────────────────────────────────────────────────
test("Market Hypothesis stays UNKNOWN (not invented) with zero supporting evidence", () => {
  const hypothesis = buildMarketHypothesis("AI", [], NOW);
  assert.equal(hypothesis.confidence, null);
  assert.equal(hypothesis.supportingEvidenceRefs.length, 0);
  assert.ok(hypothesis.unknowns.length > 0);
  assert.match(hypothesis.thesis, /現時点でEvidenceに基づく市場仮説を立てられません/);
});

// ── Market Structure Test ────────────────────────────────────────────────
test("Market Structure organizes the value chain with a role for every THEME_UNIVERSE theme", () => {
  for (const theme of THEME_UNIVERSE) assert.ok(THEME_MARKET_ROLE[theme.id], `${theme.id} must have a market-structure role`);
  const graph = buildThemeGraph(["HBM"], [], 2);
  const structure = buildMarketStructure("HBM", graph, NOW);
  assert.ok(structure.nodes.some((node) => node.id === "hbm" && node.role === "COMPONENT"));
  assert.ok(structure.nodes.some((node) => node.id === "semiconductor-equipment"));
  assert.equal(marketStructureRoleOf("unknown-theme-id"), null);
});

// ── Picks & Shovels (reuses Market Structure / Theme Graph causal chain) ──
test("Picks & Shovels only promotes candidates with an evidenced one-hop theme-graph dependency", () => {
  const graph = buildThemeGraph(["HBM"], [{ name: "HBM", score: 90, coverage: 0.8, reason: "", evidenceRefs: ["e1"], freshness: "daily", hot: true }], 2);
  const withDiscovery = candidate({ ticker: "AMAT", themes: ["HBM"], themeGraphDiscoveries: [{ ticker: "AMAT", seedTheme: "HBM", discoveredTheme: "Semiconductor Equipment", hopDistance: 1 }] });
  const withoutDiscovery = candidate({ ticker: "RANDOM", themes: ["HBM"] });
  const beneficiaries = buildPicksAndShovelsBeneficiaries([withDiscovery, withoutDiscovery], graph);
  assert.ok(beneficiaries.some((item) => item.ticker === "AMAT"));
  assert.ok(!beneficiaries.some((item) => item.ticker === "RANDOM"), "thematic similarity alone must not create a beneficiary");
});

// ── Bottleneck Test ──────────────────────────────────────────────────────
test("Bottleneck requires explicit constraint language, not just a hot theme", () => {
  const constrained = [newsItem({ id: "b1", factSummary: "HBM supply constraint reported by suppliers", relatedThemes: ["HBM"] })];
  const assessments = buildBottleneckAssessments(constrained, ["HBM"], NOW);
  assert.equal(assessments.length, 1);
  assert.ok(assessments[0].evidenceRefs.includes("b1"));
  assert.deepEqual(buildBottleneckAssessments([newsItem({ id: "n", factSummary: "AI demand increased", relatedThemes: ["HBM"] })], ["HBM"], NOW), []);
});

// ── Causal Distance Test ─────────────────────────────────────────────────
test("Causal Distance stays within 1-5 or null (UNKNOWN), never guessed from a theme tag alone", () => {
  const direct = candidate({ ticker: "MU", themes: ["HBM"] }); // MU is a direct THEME_UNIVERSE constituent of HBM
  const viaGraph = candidate({ ticker: "AMAT", themes: ["HBM"], themeGraphDiscoveries: [{ ticker: "AMAT", seedTheme: "HBM", discoveredTheme: "Semiconductor Equipment", hopDistance: 1 }] });
  const unknown = candidate({ ticker: "ZZZZ", themes: ["HBM"] });
  const links = buildCausalLinks([direct, viaGraph, unknown]);
  for (const link of links) assert.ok(link.distance === null || (link.distance >= 1 && link.distance <= 5));
  assert.equal(links.find((link) => link.to === "MU").distance, 1);
  assert.equal(links.find((link) => link.to === "AMAT").distance, 2);
  assert.equal(links.find((link) => link.to === "ZZZZ").distance, null, "no evidenced path must stay UNKNOWN, not default to Direct");
});

// ── Company Compare Test ─────────────────────────────────────────────────
test("Company Comparison compares multiple companies and records missing data as null, not zero", () => {
  const shortlist = buildCandidateShortlist([candidate({ ticker: "NVDA" }), candidate({ ticker: "AMD", name: "AMD" }), candidate({ ticker: "MU", name: "Micron" })], [], [opportunity({ ticker: "NVDA", score: 80 }), opportunity({ ticker: "AMD", score: 60 }), opportunity({ ticker: "MU", score: 40 })]);
  assert.equal(shortlist.length, 3);
  const fundamentals = new Map([["NVDA", { ticker: "NVDA", revenue: 100, revenueGrowth: 20, eps: 1, epsGrowth: 10, operatingIncome: 10, operatingMargin: 15, operatingCashFlow: 20, capex: 5, fcf: 15, equity: 50, roic: null, per: 30, pbr: 10, sourceUrl: "https://sec.gov/f", observedAt: "2025-12-31", filedAt: "2026-02-01", freshness: "delayed" }]]);
  const comparison = buildCompanyComparisonRows("AI", shortlist, fundamentals, []);
  assert.equal(comparison.rows.length, 3);
  assert.equal(comparison.singleCompanyException, false);
  const nvda = comparison.rows.find((row) => row.ticker === "NVDA");
  assert.equal(nvda.revenueGrowth, 20);
  assert.equal(nvda.grossMargin, null);
  assert.ok(nvda.missingData.includes("Gross Margin"));
  const amd = comparison.rows.find((row) => row.ticker === "AMD");
  assert.equal(amd.revenueGrowth, null, "missing fundamentals must be null, never zero");
});

// ── Evidence Test ────────────────────────────────────────────────────────
test("Research artifacts preserve evidenceRefs end to end", () => {
  const news = [newsItem({ id: "e1", impacts: [{ targetType: "theme", targetId: "AI", direction: "positive", confidence: 0.9, rationale: "demand", evidenceIds: ["e1"], role: "future_demand" }] })];
  const hypothesis = buildMarketHypothesis("AI", news, NOW);
  assert.ok(hypothesis.supportingEvidenceRefs.includes("e1"));
  const artifact = marketHypothesisToArtifact(hypothesis, NOW);
  assert.ok(artifact.evidenceRefs.includes("e1"));
});

// ── Look Ahead Test ──────────────────────────────────────────────────────
test("Look-ahead bias: news published after the research timestamp is excluded from Market Hypothesis and Bottleneck", () => {
  const future = newsItem({ id: "future", publishedAt: "2026-10-01", factSummary: "HBM supply constraint", relatedThemes: ["HBM"], impacts: [{ targetType: "theme", targetId: "HBM", direction: "positive", confidence: 0.9, rationale: "demand", evidenceIds: ["future"], role: "future_demand" }] });
  const hypothesis = buildMarketHypothesis("HBM", [future], NOW);
  assert.equal(hypothesis.supportingEvidenceRefs.length, 0, "future-dated news must not confirm a hypothesis at an earlier `now`");
  const bottlenecks = buildBottleneckAssessments([future], ["HBM"], NOW);
  assert.equal(bottlenecks.length, 0, "future-dated news must not create a bottleneck at an earlier `now`");
});

// ── Orchestrator wiring / backward compatibility ─────────────────────────
test("buildInvestmentResearchBundle composes the full sequence without throwing on empty input", () => {
  const bundle = buildInvestmentResearchBundle({ now: NOW, marketRegime: "DATA_INCOMPLETE", themes: [], candidates: [], opportunities: [], fundamentals: new Map(), news: [], graph: { nodes: [], edges: [] } });
  assert.deepEqual(bundle.marketHypotheses, []);
  assert.deepEqual(bundle.artifacts, []);
  assert.equal(bundle.generatedAt, NOW.toISOString());
});
