import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";

const dist = process.env.FUND_DIST;
const { parseFredResponse } = await import(path.join(dist, "intel/investing/intelligence/providers/fred.js"));
const { parseSecCompanyFacts } = await import(path.join(dist, "intel/investing/intelligence/providers/sec.js"));
const { buildOpportunity } = await import(path.join(dist, "intel/investing/intelligence/engine.js"));

test("FRED parser keeps observed values and direction", () => {
  const metric = parseFredResponse("DGS10", "US 10Y", "%", { observations: [{ date: "2026-09-25", value: "4.1" }, { date: "2026-09-26", value: "4.2" }] }, "2026-09-27T00:00:00Z");
  assert.equal(metric.value, 4.2); assert.equal(metric.previousValue, 4.1); assert.equal(metric.direction, "up");
});

test("SEC parser derives growth, margin and FCF without inventing valuation", () => {
  const rows = (a, b) => ({ units: { USD: [{ val: a, end: "2024-12-31", form: "10-K" }, { val: b, end: "2025-12-31", form: "10-K" }] } });
  const data = parseSecCompanyFacts("TEST", { facts: { "us-gaap": { RevenueFromContractWithCustomerExcludingAssessedTax: rows(100, 120), OperatingIncomeLoss: rows(10, 18), NetCashProvidedByUsedInOperatingActivities: rows(20, 30), PaymentsToAcquirePropertyPlantAndEquipment: rows(5, 8) } } }, "https://sec.example/facts");
  assert.ok(Math.abs(data.revenueGrowth - 20) < 0.001); assert.equal(data.operatingMargin, 15); assert.equal(data.fcf, 22); assert.equal(data.per, null);
});

test("GO gate fails closed when required evidence and coverage are missing", () => {
  const opportunity = buildOpportunity({ ticker: "TEST", name: "Test", theme: "Technology", bars: null, marketRegime: "DATA_INCOMPLETE", held: false, evidence: [], now: new Date("2026-09-27T00:00:00Z") });
  assert.equal(opportunity.gate, "DATA_INCOMPLETE"); assert.ok(opportunity.coverage < 0.8); assert.ok(opportunity.missingEvidence.includes("fundamental"));
});
