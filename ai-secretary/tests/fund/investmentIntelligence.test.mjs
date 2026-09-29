import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";

const dist = process.env.FUND_DIST;
const { parseFredResponse } = await import(path.join(dist, "intel/investing/intelligence/providers/fred.js"));
const { parseSecCompanyFacts } = await import(path.join(dist, "intel/investing/intelligence/providers/sec.js"));
const { buildOpportunity, deriveMarketRegime } = await import(path.join(dist, "intel/investing/intelligence/engine.js"));
const { investmentIntelligenceEnabled } = await import(path.join(dist, "intel/investing/intelligence/flags.js"));
const { classifyNewsDirection, classifyNewsImpacts, newsTrustTier } = await import(path.join(dist, "intel/investing/intelligence/newsImpact.js"));
const { buildInvestmentCandidates, normalizeTheme, sectorsForThemes } = await import(path.join(dist, "intel/investing/intelligence/themes.js"));

test("feature flag is enabled only by the exact true value", () => {
  const original = process.env.INVESTING_INTELLIGENCE_ENABLED;
  try { delete process.env.INVESTING_INTELLIGENCE_ENABLED; assert.equal(investmentIntelligenceEnabled(), false); process.env.INVESTING_INTELLIGENCE_ENABLED = "false"; assert.equal(investmentIntelligenceEnabled(), false); process.env.INVESTING_INTELLIGENCE_ENABLED = "true"; assert.equal(investmentIntelligenceEnabled(), true); }
  finally { if (original === undefined) delete process.env.INVESTING_INTELLIGENCE_ENABLED; else process.env.INVESTING_INTELLIGENCE_ENABLED = original; }
});

test("FRED parser normalizes ascending, descending and unsorted observations", () => {
  const rows = [{ date: "2026-09-24", value: "4.0" }, { date: "2026-09-26", value: "4.2" }, { date: "2026-09-25", value: "4.1" }];
  for (const observations of [rows, [...rows].reverse(), [rows[1], rows[0], rows[2]]]) { const metric = parseFredResponse("DGS10", "US 10Y", "%", { observations }, "2026-09-27T00:00:00Z"); assert.equal(metric.value, 4.2); assert.equal(metric.previousValue, 4.1); assert.equal(metric.observedAt, "2026-09-26"); assert.equal(metric.direction, "up"); }
});

test("SEC parser derives growth, margin and FCF without inventing valuation", () => {
  const rows = (a, b) => ({ units: { USD: [{ val: a, end: "2024-12-31", filed: "2025-02-01", form: "10-K" }, { val: b, end: "2025-12-31", filed: "2026-02-01", form: "10-K" }] } });
  const data = parseSecCompanyFacts("TEST", { facts: { "us-gaap": { RevenueFromContractWithCustomerExcludingAssessedTax: rows(100, 120), OperatingIncomeLoss: rows(10, 18), NetCashProvidedByUsedInOperatingActivities: rows(20, 30), PaymentsToAcquirePropertyPlantAndEquipment: rows(5, 8) } } }, "https://sec.example/facts", new Date("2026-09-27T00:00:00Z"));
  assert.ok(Math.abs(data.revenueGrowth - 20) < 0.001); assert.equal(data.operatingMargin, 15); assert.equal(data.fcf, 22); assert.equal(data.per, null); assert.equal(data.observedAt, "2025-12-31"); assert.equal(data.filedAt, "2026-02-01"); assert.equal(data.freshness, "delayed");
});

test("unknown-impact news does not score Future Demand or Catalyst", () => {
  const evidence = [{ id: "news-1", sourceType: "news", sourceName: "source", sourceUrl: "https://example.com/news", publishedAt: "2026-09-26", fetchedAt: "2026-09-27T00:00:00Z", fact: "theme matched", metric: "catalyst", value: "unknown", freshness: "daily" }];
  const item = buildOpportunity({ ticker: "TEST", name: "Test", theme: "AI", bars: null, marketRegime: "DATA_INCOMPLETE", held: false, evidence, now: new Date("2026-09-27T00:00:00Z") });
  assert.equal(item.breakdown.find((factor) => factor.key === "futureDemand").score, null); assert.equal(item.breakdown.find((factor) => factor.key === "catalyst").score, null);
});

test("stale fundamentals do not satisfy the mandatory gate", () => {
  const fundamental = { ticker: "TEST", revenue: 100, revenueGrowth: 10, eps: null, epsGrowth: null, operatingIncome: null, operatingMargin: null, operatingCashFlow: null, capex: null, fcf: null, equity: null, roic: null, per: null, pbr: null, sourceUrl: "https://sec.example/facts", observedAt: "2020-12-31", filedAt: "2021-02-01", freshness: "stale" };
  const item = buildOpportunity({ ticker: "TEST", name: "Test", theme: "AI", bars: null, marketRegime: "DATA_INCOMPLETE", held: false, evidence: [], fundamental, now: new Date("2026-09-27T00:00:00Z") });
  assert.ok(item.missingEvidence.includes("fundamental"));
});

test("market regime requires all six independent inputs", () => {
  const bars = Array.from({ length: 205 }, (_, index) => ({ date: "2026-09-26", open: 100 + index, high: 101 + index, low: 99 + index, close: 100 + index, volume: 1000 }));
  const macro = { available: true, regime: "NEUTRAL", coverage: 1, evidenceRefs: [], metrics: [{ id: "DGS10", value: 4, freshness: "daily", observedAt: "2026-09-26" }, { id: "USDJPY", value: 150, freshness: "delayed", observedAt: "2026-09-26" }] };
  const incomplete = deriveMarketRegime({ spy: bars, nasdaq: bars, sox: null, vix: bars.slice(-21), macro, now: new Date("2026-09-27T00:00:00Z") }); assert.equal(incomplete.regime, "DATA_INCOMPLETE"); assert.equal(incomplete.coverage, 5 / 6); assert.ok(incomplete.requiredInputs.includes("SOX"));
  const complete = deriveMarketRegime({ spy: bars, nasdaq: bars, sox: bars, vix: bars.slice(-21), macro, now: new Date("2026-09-27T00:00:00Z") }); assert.equal(complete.coverage, 1); assert.equal(complete.availableInputs.length, 6); assert.notEqual(complete.regime, "DATA_INCOMPLETE");
});

test("scenarios are never emitted without evidence ids", () => {
  const item = buildOpportunity({ ticker: "TEST", name: "Test", theme: "AI", bars: null, marketRegime: "DATA_INCOMPLETE", held: false, evidence: [], now: new Date("2026-09-27T00:00:00Z") }); assert.equal(item.scenarios.length, 0); assert.ok(item.scenarios.every((scenario) => scenario.evidenceIds.length > 0));
});

test("GO gate fails closed when required evidence and coverage are missing", () => {
  const opportunity = buildOpportunity({ ticker: "TEST", name: "Test", theme: "Technology", bars: null, marketRegime: "DATA_INCOMPLETE", held: false, evidence: [], now: new Date("2026-09-27T00:00:00Z") });
  assert.equal(opportunity.gate, "DATA_INCOMPLETE"); assert.ok(opportunity.coverage < 0.8); assert.ok(opportunity.missingEvidence.includes("fundamental"));
});

test("news impact requires explicit direction, matching theme and a trusted source", () => {
  assert.equal(newsTrustTier("https://www.sec.gov/news/test"), "TIER_1");
  assert.equal(newsTrustTier("https://www.reuters.com/technology/test"), "TIER_2");
  assert.equal(newsTrustTier("https://blog.example.com/test"), "TIER_3");
  const positive = classifyNewsImpacts({ id: "n1", title: "AI investment growth", summary: "Data center capex demand increased and earnings beat", themes: ["AI"], trustTier: "TIER_2" });
  assert.deepEqual(new Set(positive.map((impact) => impact.role)), new Set(["future_demand", "catalyst"]));
  assert.ok(positive.every((impact) => impact.targetId === "AI" && impact.direction === "positive" && impact.confidence >= 0.7));
  const mixed = classifyNewsImpacts({ id: "n-mixed", title: "AI investment growth", summary: "Demand increased but later declined", themes: ["AI"], trustTier: "TIER_1" });
  assert.equal(classifyNewsDirection("AI investment growth but demand declined"), "unknown");
  assert.equal(mixed.length, 0, "mixed positive and negative language must fail closed as unknown");
  assert.equal(classifyNewsImpacts({ id: "n2", title: "AI conference", summary: "A conference was held", themes: ["AI"], trustTier: "TIER_1" }).length, 0);
  assert.equal(classifyNewsImpacts({ id: "n3", title: "AI demand growth", summary: "Demand increased", themes: ["AI"], trustTier: "TIER_3" }).length, 0);
});

test("theme normalization and candidate merge preserve multi-theme membership", () => {
  assert.equal(normalizeTheme("🤖 生成AI"), "AI");
  assert.deepEqual(sectorsForThemes(["GPU"]), ["Semiconductors"]);
  const candidates = buildInvestmentCandidates({ portfolio: [{ ticker: "NVDA", name: "NVIDIA" }], watchlist: [{ ticker: "nvda", name: "NVIDIA", theme: "AI" }, { ticker: "NVDA", name: "NVIDIA", theme: "GPU" }] });
  assert.equal(candidates.length, 1); assert.equal(candidates[0].held, true); assert.equal(candidates[0].watchlisted, true); assert.ok(candidates[0].themes.includes("AI")); assert.ok(candidates[0].themes.includes("GPU")); assert.deepEqual(candidates[0].sectors, ["Technology", "Semiconductors"]);
  const heldOnly = buildInvestmentCandidates({ portfolio: [{ ticker: "NVDA", name: "NVIDIA" }], watchlist: [] });
  assert.ok(heldOnly[0].themes.includes("AI")); assert.ok(heldOnly[0].themes.includes("GPU")); assert.ok(heldOnly[0].candidateSources.includes("theme-universe"));
});

test("role-specific news scores only its matching factor and stale sector is excluded", () => {
  const evidence = [{ id: "n1", sourceType: "news", sourceName: "Reuters", sourceUrl: "https://reuters.com/a", publishedAt: "2026-09-26", fetchedAt: "2026-09-27T00:00:00Z", fact: "AI demand increased", metric: "news:future_demand", value: "positive", freshness: "daily" }];
  const sector = { id: "s1", name: "Semiconductors", proxy: "SOXX", momentum1d: 1, momentum5d: 2, momentum20d: 3, relativeStrength20d: 1, relativeVolume: 1, high20Proximity: 0.9, score: 80, freshness: "stale", evidenceRefs: ["m1"] };
  const item = buildOpportunity({ ticker: "TEST", name: "Test", theme: "AI", bars: null, marketRegime: "NEUTRAL", held: false, evidence, sector, now: new Date("2026-09-27T00:00:00Z") });
  assert.notEqual(item.breakdown.find((factor) => factor.key === "futureDemand").score, null); assert.equal(item.breakdown.find((factor) => factor.key === "catalyst").score, null); assert.equal(item.breakdown.find((factor) => factor.key === "sectorStrength").score, null);
});

test("negative news does not add positive score and remains as warning risk", () => {
  const evidence = [
    { id: "negative-demand", sourceType: "news", sourceName: "Reuters", sourceUrl: "https://reuters.com/demand", publishedAt: "2026-09-26", fetchedAt: "2026-09-27T00:00:00Z", fact: "Demand declined", metric: "news:future_demand", value: "negative", freshness: "daily" },
    { id: "negative-catalyst", sourceType: "news", sourceName: "Official IR", sourceUrl: "https://investor.example.com/catalyst", publishedAt: "2026-09-26", fetchedAt: "2026-09-27T00:00:00Z", fact: "Launch delayed", metric: "news:catalyst", value: "negative", freshness: "daily" },
  ];
  const item = buildOpportunity({ ticker: "TEST", name: "Test", theme: "AI", bars: null, marketRegime: "NEUTRAL", held: false, evidence, now: new Date("2026-09-27T00:00:00Z") });
  assert.equal(item.breakdown.find((factor) => factor.key === "futureDemand").score, null);
  assert.equal(item.breakdown.find((factor) => factor.key === "catalyst").score, null);
  assert.ok(item.riskFlags.some((flag) => flag.code === "NEGATIVE_DEMAND" && flag.severity === "warning"));
  assert.ok(item.riskFlags.some((flag) => flag.code === "NEGATIVE_CATALYST" && flag.severity === "warning"));
});

test("coverage can reach 80 percent without valuation or portfolio-fit guesses", () => {
  const bars = Array.from({ length: 21 }, (_, index) => ({ date: `2026-09-${String(6 + index).padStart(2, "0")}`, open: 100, high: 102, low: 99, close: 101, volume: index === 20 ? 3_000_000 : 1_000_000 }));
  const news = Array.from({ length: 5 }, (_, index) => ([{ id: `d${index}`, sourceType: "news", sourceName: `Demand ${index}`, sourceUrl: `https://reuters.com/d${index}`, publishedAt: "2026-09-26", fetchedAt: "2026-09-27T00:00:00Z", fact: "demand growth", metric: "news:future_demand", value: "positive", freshness: "daily" }, { id: `c${index}`, sourceType: "news", sourceName: `Catalyst ${index}`, sourceUrl: `https://reuters.com/c${index}`, publishedAt: "2026-09-26", fetchedAt: "2026-09-27T00:00:00Z", fact: "earnings beat", metric: "news:catalyst", value: "positive", freshness: "daily" }])).flat();
  const evidence = [...news, { id: "m1", sourceType: "market", sourceName: "Yahoo", sourceUrl: null, publishedAt: "2026-09-26", fetchedAt: "2026-09-27T00:00:00Z", fact: "market", metric: "ohlcv", value: 101, freshness: "daily" }, { id: "f1", sourceType: "research", sourceName: "SEC", sourceUrl: "https://sec.gov/f", publishedAt: "2026-02-01", fetchedAt: "2026-09-27T00:00:00Z", fact: "fundamental", metric: "fundamentals", value: 100, freshness: "delayed" }];
  const fundamental = { ticker: "TEST", revenue: 100, revenueGrowth: 30, eps: null, epsGrowth: null, operatingIncome: null, operatingMargin: null, operatingCashFlow: null, capex: null, fcf: 10, equity: null, roic: null, per: null, pbr: null, sourceUrl: "https://sec.gov/f", observedAt: "2025-12-31", filedAt: "2026-02-01", freshness: "delayed" };
  const sector = { id: "s1", name: "Semiconductors", proxy: "SOXX", momentum1d: 1, momentum5d: 2, momentum20d: 3, relativeStrength20d: 1, relativeVolume: 1, high20Proximity: 0.9, score: 100, freshness: "daily", evidenceRefs: ["m1"] };
  const item = buildOpportunity({ ticker: "TEST", name: "Test", theme: "AI", bars, marketRegime: "RISK_ON", held: false, evidence, fundamental, sector, now: new Date("2026-09-27T00:00:00Z") });
  assert.equal(item.scoreCoverage, 85); assert.equal(item.coverage, 0.85); assert.equal(item.breakdown.find((factor) => factor.key === "valuation").score, null); assert.equal(item.breakdown.find((factor) => factor.key === "portfolioFit").score, null);
});

test("critical liquidity risk prevents GO", () => {
  const bars = Array.from({ length: 21 }, (_, index) => ({ date: `2026-09-${String(6 + index).padStart(2, "0")}`, open: 1, high: 1, low: 1, close: 1, volume: index === 20 ? 30_000 : 10_000 }));
  const item = buildOpportunity({ ticker: "ILLIQ", name: "Illiquid", theme: "AI", bars, marketRegime: "RISK_ON", held: false, evidence: [], now: new Date("2026-09-27T00:00:00Z") });
  assert.ok(item.riskFlags.some((flag) => flag.code === "LOW_LIQUIDITY" && flag.severity === "critical")); assert.notEqual(item.gate, "GO_CANDIDATE");
});
