import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { buildSemiconductorPortfolioResearch } = require(`${process.env.FUND_DIST}/intel/investing/intelligence/semiconductorResearch.js`);

const evidence = (overrides = {}) => ({
  id: "e1", sourceType: "market", sourceName: "Yahoo", sourceUrl: null,
  publishedAt: "2026-10-23", fetchedAt: "2026-10-24T00:00:00.000Z",
  fact: "NVDA close 100", metric: "ohlcv", value: 100, freshness: "daily", currency: "USD", scope: "COMPANY", ...overrides,
});

test("projects known held semiconductor research without position sizing fields", () => {
  const positions = [
    { code: "NVDA", name: "NVIDIA", assetClass: "us_stock", quantity: 3, avgCost: 10, marketValueJpy: 300, currency: "USD" },
    { code: "7203", name: "Toyota", assetClass: "jp_stock", quantity: 5, avgCost: 20, marketValueJpy: 100, currency: "JPY" },
  ];
  const opportunity = {
    ticker: "NVDA", evidence: [evidence(), evidence({ id: "e2", sourceType: "research", metric: "fundamentals", sourceUrl: "https://www.sec.gov/example", scope: "COMPANY" }), evidence({ id: "e3", sourceType: "news", metric: "news:catalyst", scope: "INDUSTRY" })],
    scenarios: [{ kind: "BASE", evidenceIds: ["e1"] }], riskFlags: [{ detail: "Risk evidence" }], missingEvidence: ["valuation"],
  };
  const result = buildSemiconductorPortfolioResearch(positions, { asOf: "2026-10-24T00:00:00.000Z", opportunities: [opportunity], sectors: [] });
  assert.deepEqual(result.semiconductors.map((item) => item.ticker), ["NVDA"]);
  assert.equal(result.semiconductors[0].price.currency, "USD");
  assert.equal(result.semiconductors[0].price.asOf, "2026-10-23");
  assert.equal(result.semiconductors[0].causes.industry[0].id, "e3");
  assert.equal(result.semiconductors[0].financialEvidence[0].id, "e2");
  assert.equal(result.semiconductors[0].scenarios[0].kind, "BASE");
  assert.equal(result.semiconductors[0].risks[0], "Risk evidence");
  assert.equal(JSON.stringify(result).includes("quantity"), false);
  assert.equal(JSON.stringify(result).includes("avgCost"), false);
  assert.equal(JSON.stringify(result).includes("marketValueJpy"), false);
});

test("keeps absent market, financial, and industry evidence explicitly missing", () => {
  const result = buildSemiconductorPortfolioResearch(
    [{ code: "MU", name: "Micron", assetClass: "us_stock", quantity: 1, avgCost: 1, marketValueJpy: 1, currency: "USD" }],
    { asOf: "2026-10-24T00:00:00.000Z", opportunities: [{ ticker: "MU", evidence: [], scenarios: [], riskFlags: [], missingEvidence: [] }], sectors: [] },
  );
  assert.equal(result.semiconductors[0].price, null);
  assert.ok(result.semiconductors[0].missing.includes("株価Evidence"));
  assert.ok(result.semiconductors[0].missing.includes("決算・業績Evidence"));
  assert.ok(result.semiconductors[0].missing.includes("半導体業界Evidence"));
});

test("does not infer price currency when old saved evidence lacks it", () => {
  const result = buildSemiconductorPortfolioResearch(
    [{ code: "AMD", name: "AMD", assetClass: "us_stock", quantity: 1, avgCost: 1, marketValueJpy: 1, currency: "USD" }],
    { asOf: "2026-10-24T00:00:00.000Z", opportunities: [{ ticker: "AMD", evidence: [evidence({ currency: undefined })], scenarios: [], riskFlags: [], missingEvidence: [] }], sectors: [] },
  );
  assert.equal(result.semiconductors[0].price.currency, "UNKNOWN");
  assert.ok(result.semiconductors[0].missing.includes("株価通貨"));
});
