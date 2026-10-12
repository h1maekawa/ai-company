import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
const read = (path) => fs.readFileSync(path, "utf8");

const PORTFOLIO_RISK_FILES = [
  "app/lib/investing/portfolioRisk/types.ts",
  "app/lib/investing/portfolioRisk/thresholds.ts",
  "app/lib/investing/portfolioRisk/shared.ts",
  "app/lib/investing/portfolioRisk/themeConcentration.ts",
  "app/lib/investing/portfolioRisk/sectorConcentration.ts",
  "app/lib/investing/portfolioRisk/singleStockExposure.ts",
  "app/lib/investing/portfolioRisk/countryExposure.ts",
  "app/lib/investing/portfolioRisk/currencyExposure.ts",
  "app/lib/investing/portfolioRisk/correlationRisk.ts",
  "app/lib/investing/portfolioRisk/drawdownRisk.ts",
  "app/lib/investing/portfolioRisk/thesisRisk.ts",
  "app/lib/investing/portfolioRisk/orchestrator.ts",
  "app/lib/investing/portfolioRisk/loader.ts",
];
const PIPELINE_FILES = [
  "app/lib/investing/opportunityPipeline/types.ts",
  "app/lib/investing/opportunityPipeline/deriveStatus.ts",
  "app/lib/investing/opportunityPipeline/build.ts",
  "app/lib/investing/opportunityPipeline/loader.ts",
];
const ALL_FILES = [...PORTFOLIO_RISK_FILES, ...PIPELINE_FILES];

test("No X Dependency: Portfolio Intelligence and Opportunity Pipeline never import note/X/content modules", () => {
  for (const path of ALL_FILES) {
    const source = read(path);
    assert.doesNotMatch(source, /from\s+["'].*\/(note|content|instagram)\//, `${path} must not import note/content/instagram modules`);
    assert.doesNotMatch(source, /xBridge|learningBrief|researchProjection|Buffer|DailyX/, `${path} must not reference the X/note bridge`);
  }
});

test("No Broker / No Auto Trade: no file describes an execution path or automatic portfolio mutation", () => {
  for (const path of ALL_FILES) {
    const source = read(path);
    assert.doesNotMatch(source, /placeOrder|autoBuy|autoSell|broker\.execute|executeTrade|positionSize|orderType|rebalance\(/i, `${path} must not describe an execution/rebalance path`);
    assert.doesNotMatch(source, /savePortfolio|savePosition|saveVaultFile\(.*(holdings|positions)/i, `${path} must not write back to the portfolio/holdings store`);
  }
});

test("Human Gate: Opportunity Pipeline statuses never include a trade action", () => {
  const types = read("app/lib/investing/opportunityPipeline/types.ts");
  assert.match(types, /"DISCOVERED"[\s\S]*"RESEARCHING"[\s\S]*"WATCH"[\s\S]*"WAIT_ENTRY"[\s\S]*"GO_CANDIDATE"[\s\S]*"HOLDING"[\s\S]*"INVALIDATED"[\s\S]*"ARCHIVED"/);
  assert.doesNotMatch(types, /"BUY"|"SELL"|"EXECUTED"|"ORDERED"/);
});

test("Portfolio Risk and Pipeline builders are pure over already-loaded inputs (loader.ts is the only I/O boundary)", () => {
  const pureFiles = [...PORTFOLIO_RISK_FILES, ...PIPELINE_FILES].filter((path) => !path.endsWith("loader.ts"));
  for (const path of pureFiles) {
    const source = read(path);
    assert.doesNotMatch(source, /\bfetch\(|getVaultFile|saveVaultFile|getProvider\(/, `${path} must stay pure; only loader.ts may do I/O`);
  }
});

test("Horizon/Triple Gate are read, never recomputed, by the Opportunity Pipeline", () => {
  const build = read("app/lib/investing/opportunityPipeline/build.ts");
  assert.doesNotMatch(build, /score\s*[:=]\s*[\d.]+|buildShortTermAssessment|buildMidTermAssessment|buildLongTermAssessment|deriveMarketRegime/, "build.ts must not recompute a score or horizon assessment");
  assert.match(build, /opportunity\?\.shortTerm\?\.gate/);
  assert.match(build, /opportunity\?\.tripleGate/);
});

test("backward compatibility: existing WatchItem fields and loadWatchlist() return shape are unchanged", () => {
  const watchlist = read("app/lib/investing/watchlist.ts");
  for (const field of ["name:", "ticker:", "market:", "reason:", "status:"]) {
    assert.match(watchlist, new RegExp(field.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), `WatchItem must keep existing field ${field}`);
  }
  assert.doesNotMatch(watchlist, /pipelineStatus|OpportunityPipelineStatus/, "watchlist.ts itself is unmodified by PR-D; the pipeline is a separate, additive projection");
});

test("app/lib/investing/analysis.ts (existing diversification health) is unmodified and not imported as the primary portfolio risk signal", () => {
  for (const path of PORTFOLIO_RISK_FILES) {
    const source = read(path);
    assert.doesNotMatch(source, /from\s+["'].*\/analysis["']/, `${path} must not depend on the legacy analysis.ts health score as its primary signal`);
  }
});

test("Production/Secrets/env/Cron surfaces are untouched by Portfolio Intelligence / Opportunity Pipeline", () => {
  for (const path of ["app/lib/investing/intelligence/cron.ts", "app/lib/investing/intelligence/flags.ts", "vercel.json"]) {
    const source = read(path);
    assert.doesNotMatch(source, /portfolioRisk\/|opportunityPipeline\/|PortfolioRiskReport|OpportunityPipelineItem/, `${path} must not reference the new Portfolio Intelligence / Opportunity Pipeline modules`);
  }
});
