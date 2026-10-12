import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";

const dist = process.env.FUND_DIST;
const { deriveOpportunityPipelineStatus } = await import(path.join(dist, "intel/investing/opportunityPipeline/deriveStatus.js"));
const { buildOpportunityPipelineItems } = await import(path.join(dist, "intel/investing/opportunityPipeline/build.js"));

const NOW = new Date("2026-09-27T00:00:00Z");

function opportunity(overrides = {}) {
  return {
    id: "opp", ticker: "NVDA", name: "NVIDIA", theme: "AI", gate: "WAIT", score: 60, scoreCoverage: 60, coverage: 0.6,
    mandatoryEvidence: [], missingEvidence: [], riskFlags: [], breakdown: [], relativeVolume: null, priceChangePct: null,
    catalyst: null, whyNow: "demand evidence", portfolioImpact: "", portfolioAction: "WATCH", scenarios: [], evidence: [],
    missingData: [], generatedAt: NOW.toISOString(), tripleGate: "TRIPLE_GO", ...overrides,
  };
}

// ── Status lifecycle / Triple Gate integration ───────────────────────────────
test("Triple Gate maps to the documented pipeline status", () => {
  assert.equal(deriveOpportunityPipelineStatus({ held: false, invalidated: false, tripleGate: "TRIPLE_GO" }), "GO_CANDIDATE");
  assert.equal(deriveOpportunityPipelineStatus({ held: false, invalidated: false, tripleGate: "MID_LONG_GO" }), "WATCH");
  assert.equal(deriveOpportunityPipelineStatus({ held: false, invalidated: false, tripleGate: "SHORT_ONLY" }), "WAIT_ENTRY");
  assert.equal(deriveOpportunityPipelineStatus({ held: false, invalidated: false, tripleGate: "LONG_ONLY" }), "WATCH");
  assert.equal(deriveOpportunityPipelineStatus({ held: false, invalidated: false, tripleGate: "NO_GO" }), "WATCH");
  assert.equal(deriveOpportunityPipelineStatus({ held: false, invalidated: false, tripleGate: "MIXED" }), "RESEARCHING");
});

// ── DATA_INCOMPLETE -> RESEARCHING ───────────────────────────────────────────
test("DATA_INCOMPLETE Triple Gate maps to RESEARCHING, and no gate data maps to DISCOVERED", () => {
  assert.equal(deriveOpportunityPipelineStatus({ held: false, invalidated: false, tripleGate: "DATA_INCOMPLETE" }), "RESEARCHING");
  assert.equal(deriveOpportunityPipelineStatus({ held: false, invalidated: false, tripleGate: null }), "DISCOVERED");
});

// ── Safe forward-only progression ────────────────────────────────────────────
test("status never automatically regresses once further along the safe chain", () => {
  const advanced = deriveOpportunityPipelineStatus({ held: false, invalidated: false, tripleGate: "TRIPLE_GO", previousStatus: "WATCH" });
  assert.equal(advanced, "GO_CANDIDATE");
  const stillAdvanced = deriveOpportunityPipelineStatus({ held: false, invalidated: false, tripleGate: "MIXED", previousStatus: "GO_CANDIDATE" });
  assert.equal(stillAdvanced, "GO_CANDIDATE", "a worse day's gate must not silently demote an already-advanced status");
});

// ── HOLDING detection (read-only) ─────────────────────────────────────────────
test("a held ticker is always HOLDING regardless of its gates", () => {
  assert.equal(deriveOpportunityPipelineStatus({ held: true, invalidated: false, tripleGate: "NO_GO" }), "HOLDING");
  assert.equal(deriveOpportunityPipelineStatus({ held: true, invalidated: true, tripleGate: "TRIPLE_GO" }), "HOLDING");
});

// ── Invalidation ──────────────────────────────────────────────────────────────
test("an invalidated, non-held item moves to INVALIDATED regardless of its gate", () => {
  assert.equal(deriveOpportunityPipelineStatus({ held: false, invalidated: true, tripleGate: "TRIPLE_GO" }), "INVALIDATED");
});

test("ARCHIVED is sticky and is not auto-reopened by a later strong gate", () => {
  assert.equal(deriveOpportunityPipelineStatus({ held: false, invalidated: false, tripleGate: "TRIPLE_GO", previousStatus: "ARCHIVED" }), "ARCHIVED");
});

// ── GO_CANDIDATE != Buy ───────────────────────────────────────────────────────
test("GO_CANDIDATE is a status label, not an executed or recommended trade action", () => {
  const status = deriveOpportunityPipelineStatus({ held: false, invalidated: false, tripleGate: "TRIPLE_GO" });
  assert.equal(status, "GO_CANDIDATE");
  assert.notEqual(status, "BUY");
  assert.ok(!["BUY", "SELL", "EXECUTED", "ORDERED"].includes(status));
});

// ── Backward compatibility with the existing watchlist ───────────────────────
test("build reuses the existing watchlist shape and today's opportunities without mutating either", () => {
  const watchlistThemes = [{ theme: "🔴 AI半導体", items: [{ name: "NVIDIA", ticker: "NVDA", market: "US", reason: "AI demand", status: "監視中" }] }];
  const opportunities = [opportunity({ ticker: "NVDA", shortTerm: { gate: "WAIT" }, midTerm: { gate: "GO_CANDIDATE" }, longTerm: { gate: "GO_CANDIDATE", invalidationConditions: ["demand reverses"] }, tripleGate: "MID_LONG_GO" })];
  const portfolio = { positions: [], summary: {}, source: "none", updatedAt: null };
  const frozenWatchlist = JSON.parse(JSON.stringify(watchlistThemes));
  const items = buildOpportunityPipelineItems({ watchlistThemes, opportunities, portfolio, now: NOW });

  assert.deepEqual(watchlistThemes, frozenWatchlist, "watchlist input must not be mutated");
  assert.equal(items.length, 1);
  assert.equal(items[0].ticker, "NVDA");
  assert.equal(items[0].theme, "🔴 AI半導体");
  assert.equal(items[0].subTheme, "AI");
  assert.equal(items[0].shortGate, "WAIT");
  assert.equal(items[0].midGate, "GO_CANDIDATE");
  assert.equal(items[0].longGate, "GO_CANDIDATE");
  assert.equal(items[0].tripleGate, "MID_LONG_GO");
  assert.equal(items[0].status, "WATCH");
  assert.equal(items[0].held, false);
  assert.ok(items[0].invalidation.includes("demand reverses"));
});

test("a watchlist item with no matching opportunity today stays DISCOVERED with null gates (missing != guessed)", () => {
  const watchlistThemes = [{ theme: "Theme", items: [{ name: "Unscanned Co", ticker: "ZZZZ", market: "US", reason: "speculative", status: "" }] }];
  const items = buildOpportunityPipelineItems({ watchlistThemes, opportunities: [], portfolio: { positions: [], summary: {}, source: "none", updatedAt: null }, now: NOW });
  assert.equal(items[0].shortGate, null);
  assert.equal(items[0].tripleGate, null);
  assert.equal(items[0].status, "DISCOVERED");
  assert.equal(items[0].nextEarnings, null, "no earnings-calendar provider exists; must stay null, not guessed");
});

test("a held ticker on the watchlist is projected as HOLDING", () => {
  const watchlistThemes = [{ theme: "Theme", items: [{ name: "NVIDIA", ticker: "NVDA", market: "US", reason: "", status: "" }] }];
  const portfolio = { positions: [{ code: "NVDA", name: "NVIDIA", assetClass: "us_stock", quantity: 1, avgCost: 1, currentPrice: 1, marketValueJpy: 1000, pnlJpy: 0, pnlPct: 0, currency: "USD" }], summary: {}, source: "holdings_csv", updatedAt: null };
  const items = buildOpportunityPipelineItems({ watchlistThemes, opportunities: [opportunity({ tripleGate: "NO_GO" })], portfolio, now: NOW });
  assert.equal(items[0].status, "HOLDING");
  assert.equal(items[0].held, true);
});
