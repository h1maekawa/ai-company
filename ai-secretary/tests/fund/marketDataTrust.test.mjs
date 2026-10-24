import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const dist = process.env.FUND_DIST;
const { parseChartLastPrice } = require(path.join(dist, "market/fund/marketData/yahoo.js"));
const { convertMarketValue, classifyPriceFreshness, trustedMarketValues } = require(path.join(dist, "market/fund/marketData/snapshot.js"));
const { revaluePositions } = require(path.join(dist, "market/investing/revalue.js"));

const quote = (overrides = {}) => ({
  name: "mock",
  async getDailyBars() { return null; },
  async getLastPrice() { return null; },
  async getUsdJpy() { return null; },
  async getQuote() { return null; },
  ...overrides,
});
const position = (assetClass, currency, overrides = {}) => ({
  code: assetClass === "jp_stock" ? "7203" : "NVDA",
  name: "test",
  assetClass,
  quantity: 2,
  avgCost: 100,
  currentPrice: 100,
  marketValueJpy: 200,
  pnlJpy: 0,
  pnlPct: 0,
  currency,
  ...overrides,
});

test("Yahoo timestamp absence remains UNKNOWN instead of fabricating now", () => {
  const parsed = parseChartLastPrice({ meta: { regularMarketPrice: 100, currency: "JPY" } });
  assert.equal(parsed.asOf, null);
  assert.equal(parsed.currency, "JPY");
  assert.ok(parsed.fetchedAt);
});

test("USD and JPY market values convert only in the valid direction", () => {
  assert.deepEqual(convertMarketValue(100, "USD", 150), { priceUsd: 100, priceJpy: 15000 });
  assert.deepEqual(convertMarketValue(15000, "JPY", 150), { priceUsd: 100, priceJpy: 15000 });
  assert.deepEqual(convertMarketValue(15000, "UNKNOWN", 150), { priceUsd: null, priceJpy: null });
  assert.deepEqual(convertMarketValue(15000, "JPY", null), { priceUsd: null, priceJpy: 15000 });
  assert.deepEqual(convertMarketValue(100, "USD", 0), { priceUsd: 100, priceJpy: null });
});

test("price basis freshness distinguishes unknown timestamps and prices older than seven days", () => {
  const now = new Date("2026-10-24T00:00:00Z");
  assert.equal(classifyPriceFreshness(null, now), "UNKNOWN");
  assert.equal(classifyPriceFreshness("not-a-date", now), "UNKNOWN");
  assert.equal(classifyPriceFreshness("2026-10-01", now), "STALE");
  assert.equal(classifyPriceFreshness("2026-10-23", now), "FRESH");
  assert.deepEqual(trustedMarketValues(15000, "JPY", 150, "2026-10-01", now), {
    freshness: "STALE", priceUsd: null, priceJpy: null,
  });
  assert.deepEqual(trustedMarketValues(15000, "JPY", 150, null, now), {
    freshness: "UNKNOWN", priceUsd: null, priceJpy: null,
  });
});

test("Japanese positions remain JPY-denominated and do not request USD/JPY", async () => {
  let fxCalls = 0;
  const result = await revaluePositions([position("jp_stock", "JPY")], {
    source: "holdings_csv", importedAt: null,
    provider: quote({
      async getLastPrice() { return { price: 1500, currency: "JPY", asOf: new Date().toISOString(), fetchedAt: new Date().toISOString() }; },
      async getUsdJpy() { fxCalls++; return { rate: 150, asOf: new Date().toISOString(), fetchedAt: new Date().toISOString() }; },
    }),
  });
  assert.equal(fxCalls, 0);
  assert.equal(result.positions[0].currentPrice, 1500);
  assert.equal(result.positions[0].marketValueJpy, 3000);
});

test("US positions do not revalue from unknown or stale FX rates", async () => {
  for (const asOf of [null, "2020-01-01"]) {
    const result = await revaluePositions([position("us_stock", "USD")], {
      source: "holdings_csv", importedAt: null,
      provider: quote({
        async getLastPrice() { return { price: 200, currency: "USD", asOf: new Date().toISOString(), fetchedAt: new Date().toISOString() }; },
        async getUsdJpy() { return { rate: 150, asOf, fetchedAt: new Date().toISOString() }; },
      }),
    });
    assert.equal(result.positions[0].currentPrice, 100);
    assert.equal(result.positions[0].marketValueJpy, 200);
    assert.equal(result.fx, null);
  }
});

test("US positions convert to JPY while incompatible/missing/stale quotes never replace holdings", async () => {
  const valid = await revaluePositions([position("us_stock", "USD")], {
    source: "holdings_csv", importedAt: null,
    provider: quote({
      async getLastPrice() { return { price: 200, currency: "USD", asOf: new Date().toISOString(), fetchedAt: new Date().toISOString() }; },
      async getUsdJpy() { return { rate: 150, asOf: new Date().toISOString(), fetchedAt: new Date().toISOString() }; },
    }),
  });
  assert.equal(valid.positions[0].currentPrice, 200);
  assert.equal(valid.positions[0].marketValueJpy, 60000);

  for (const last of [
    { price: 200, currency: "JPY", asOf: new Date().toISOString(), fetchedAt: new Date().toISOString() },
    { price: 200, currency: "USD", asOf: null, fetchedAt: new Date().toISOString() },
    { price: 200, currency: "USD", asOf: "2020-01-01", fetchedAt: new Date().toISOString() },
  ]) {
    const result = await revaluePositions([position("us_stock", "USD")], {
      source: "holdings_csv", importedAt: null,
      provider: quote({
        async getLastPrice() { return last; },
        async getUsdJpy() { return { rate: 150, asOf: new Date().toISOString(), fetchedAt: new Date().toISOString() }; },
      }),
    });
    assert.equal(result.positions[0].currentPrice, 100);
    assert.equal(result.repriced, 0);
  }
});
