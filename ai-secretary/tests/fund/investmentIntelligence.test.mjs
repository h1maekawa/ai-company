import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";

const dist = process.env.FUND_DIST;
const { parseFredResponse } = await import(path.join(dist, "intel/investing/intelligence/providers/fred.js"));
const { parseSecCompanyFacts } = await import(path.join(dist, "intel/investing/intelligence/providers/sec.js"));
const { buildOpportunity, deriveMarketRegime } = await import(path.join(dist, "intel/investing/intelligence/engine.js"));
const { investmentIntelligenceEnabled } = await import(path.join(dist, "intel/investing/intelligence/flags.js"));

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
