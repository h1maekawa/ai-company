import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";

const dist = process.env.FUND_DIST;
const { buildThemeConcentration } = await import(path.join(dist, "intel/investing/portfolioRisk/themeConcentration.js"));
const { buildSectorConcentration } = await import(path.join(dist, "intel/investing/portfolioRisk/sectorConcentration.js"));
const { buildSingleStockExposure } = await import(path.join(dist, "intel/investing/portfolioRisk/singleStockExposure.js"));
const { buildCountryExposure } = await import(path.join(dist, "intel/investing/portfolioRisk/countryExposure.js"));
const { buildCurrencyExposure } = await import(path.join(dist, "intel/investing/portfolioRisk/currencyExposure.js"));
const { buildCorrelationRisk } = await import(path.join(dist, "intel/investing/portfolioRisk/correlationRisk.js"));
const { buildDrawdownRisk } = await import(path.join(dist, "intel/investing/portfolioRisk/drawdownRisk.js"));
const { buildThesisRisk } = await import(path.join(dist, "intel/investing/portfolioRisk/thesisRisk.js"));
const { buildPortfolioRiskReport } = await import(path.join(dist, "intel/investing/portfolioRisk/orchestrator.js"));

const NOW = new Date("2026-09-27T00:00:00Z");

function position(overrides = {}) {
  return { code: "NVDA", name: "NVIDIA", assetClass: "us_stock", quantity: 10, avgCost: 100, currentPrice: 120, marketValueJpy: 180_000, pnlJpy: 30_000, pnlPct: 20, currency: "USD", ...overrides };
}

function opportunity(overrides = {}) {
  return {
    id: "opp", ticker: "NVDA", name: "NVIDIA", theme: "AI", gate: "WAIT", score: 60, scoreCoverage: 60, coverage: 0.6,
    mandatoryEvidence: [], missingEvidence: [], riskFlags: [], breakdown: [], relativeVolume: null, priceChangePct: null,
    catalyst: null, whyNow: "demand evidence", portfolioImpact: "", portfolioAction: "WATCH", scenarios: [], evidence: [],
    missingData: [], generatedAt: NOW.toISOString(), ...overrides,
  };
}

function bars(length, trendUp) {
  return Array.from({ length }, (_, i) => ({ date: `d${i}`, open: 100, high: 101, low: 99, close: 100 + (trendUp ? i * 0.3 : Math.sin(i) * 2), volume: 1_000_000 }));
}

// ── Theme / Sector Concentration ────────────────────────────────────────────
test("Theme Concentration flags the dominant theme and keeps coverage honest for unmapped tickers", () => {
  const positions = [position({ code: "NVDA", marketValueJpy: 500_000 }), position({ code: "ZZZZ", name: "Unmapped Co", marketValueJpy: 500_000, assetClass: "other" })];
  const result = buildThemeConcentration(positions);
  assert.equal(result.key, "themeConcentration");
  assert.ok(result.coverage < 1, "unmapped ticker must not be silently counted as mapped");
  assert.ok(result.affectedTickers.includes("NVDA"));
});

test("Sector Concentration reuses the existing THEME_UNIVERSE sector table", () => {
  const positions = [position({ code: "NVDA", marketValueJpy: 400_000 }), position({ code: "AMD", name: "AMD", marketValueJpy: 400_000 })];
  const result = buildSectorConcentration(positions);
  assert.equal(result.key, "sectorConcentration");
  assert.notEqual(result.level, "DATA_INCOMPLETE");
});

// ── Single Stock Exposure ───────────────────────────────────────────────────
test("Single Stock Exposure flags the largest position by value", () => {
  const positions = [position({ code: "NVDA", marketValueJpy: 800_000 }), position({ code: "MU", name: "Micron", marketValueJpy: 200_000 })];
  const result = buildSingleStockExposure(positions);
  assert.equal(result.score, 80);
  assert.equal(result.level, "HIGH");
  assert.deepEqual(result.affectedTickers, ["NVDA"]);
});

// ── Country / Currency Exposure ─────────────────────────────────────────────
test("Country Exposure derives only from assetClass and leaves fund/cash/other UNKNOWN", () => {
  const positions = [position({ code: "NVDA", assetClass: "us_stock", marketValueJpy: 500_000 }), position({ code: "FUND1", name: "投信", assetClass: "fund", marketValueJpy: 500_000 })];
  const result = buildCountryExposure(positions);
  assert.ok(result.coverage < 1, "fund has no listing-country metadata and must not be guessed");
});

test("Currency Exposure uses the existing Position.currency directly", () => {
  const positions = [position({ code: "NVDA", currency: "USD", marketValueJpy: 500_000 }), position({ code: "7203", name: "Toyota", currency: "JPY", marketValueJpy: 500_000, assetClass: "jp_stock" })];
  const result = buildCurrencyExposure(positions);
  assert.equal(result.coverage, 1);
  assert.equal(result.score, 50);
  assert.equal(result.level, "LOW");
});

// ── Missing Data != 0 / DATA_INCOMPLETE ─────────────────────────────────────
test("every dimension returns DATA_INCOMPLETE, never a fabricated zero, when there is no usable data", () => {
  assert.equal(buildThemeConcentration([]).level, "DATA_INCOMPLETE");
  assert.equal(buildThemeConcentration([]).score, null);
  assert.equal(buildCorrelationRisk([position({ code: "NVDA" })], new Map()).level, "DATA_INCOMPLETE");
  assert.equal(buildDrawdownRisk([]).level, "DATA_INCOMPLETE");
  assert.equal(buildThesisRisk([position()], [], undefined).level, "DATA_INCOMPLETE");
});

// ── Correlation Risk ─────────────────────────────────────────────────────────
test("Correlation Risk computes pairwise correlation only from pre-fetched bars and never fetches itself", () => {
  const positions = [position({ code: "A", marketValueJpy: 500_000 }), position({ code: "B", marketValueJpy: 500_000 })];
  const barsByTicker = new Map([["A", bars(60, true)], ["B", bars(60, true)]]);
  const result = buildCorrelationRisk(positions, barsByTicker);
  assert.notEqual(result.level, "DATA_INCOMPLETE");
  assert.ok(result.score > 0.5, "two identical uptrends should correlate strongly");
});

// ── Drawdown Risk ─────────────────────────────────────────────────────────────
test("Drawdown Risk measures the real recorded value-history series, not an estimate", () => {
  const points = [
    { date: "2026-08-10", totalValueJpy: 1_000_000 },
    { date: "2026-08-20", totalValueJpy: 1_200_000 },
    { date: "2026-09-01", totalValueJpy: 900_000 },
    { date: "2026-09-20", totalValueJpy: 1_050_000 },
  ];
  const result = buildDrawdownRisk(points, NOW);
  assert.notEqual(result.level, "DATA_INCOMPLETE");
  assert.ok(result.score > 20, `expected >20% drawdown from the 1.2M peak to 900k trough, got ${result.score}`);
});

// ── Thesis Risk (reuses existing riskFlags / LONG horizon / MarketHypothesis) ─
test("Thesis Risk reuses existing critical riskFlags, LONG horizon weakness and MarketHypothesis invalidation", () => {
  const positions = [position({ code: "NVDA", marketValueJpy: 500_000 }), position({ code: "MU", name: "Micron", marketValueJpy: 500_000 })];
  const opportunities = [
    opportunity({ ticker: "NVDA", riskFlags: [{ code: "NEGATIVE_DEMAND", severity: "critical", detail: "demand evidence reversed" }] }),
    opportunity({ ticker: "MU", longTerm: { horizon: "LONG", score: 10, coverage: 0.9, gate: "PASS", confidence: 0.5, factors: [], bullCase: null, baseCase: null, bearCase: null, risks: [], invalidationConditions: [], evidenceRefs: [], generatedAt: NOW.toISOString() } }),
  ];
  const result = buildThesisRisk(positions, opportunities, undefined);
  assert.equal(result.score, 100);
  assert.ok(result.affectedTickers.includes("NVDA"));
  assert.ok(result.affectedTickers.includes("MU"));
});

test("Thesis Risk never flags a position with no evidence of weakening", () => {
  const positions = [position({ code: "NVDA", marketValueJpy: 500_000 })];
  const result = buildThesisRisk(positions, [opportunity({ ticker: "NVDA" })], undefined);
  assert.equal(result.score, 0);
  assert.equal(result.level, "LOW");
});

// ── Human Gate / no mutation ──────────────────────────────────────────────────
test("Portfolio Risk Report never mutates its inputs", () => {
  const positions = [position()];
  const frozen = JSON.parse(JSON.stringify(positions));
  buildPortfolioRiskReport({ portfolio: { positions, summary: {}, source: "none", updatedAt: null }, opportunities: [], research: undefined, history: [], correlationBars: new Map(), now: NOW });
  assert.deepEqual(positions, frozen);
});

test("buildPortfolioRiskReport composes all 8 dimensions", () => {
  const report = buildPortfolioRiskReport({ portfolio: { positions: [position()], summary: {}, source: "none", updatedAt: null }, opportunities: [], research: undefined, history: [], correlationBars: new Map(), now: NOW });
  const keys = report.assessments.map((a) => a.key);
  for (const key of ["themeConcentration", "sectorConcentration", "singleStockExposure", "countryExposure", "currencyExposure", "correlationRisk", "drawdownRisk", "thesisRisk"]) {
    assert.ok(keys.includes(key), `missing dimension: ${key}`);
  }
});
