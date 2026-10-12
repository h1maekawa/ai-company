import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const read = (file) => fs.readFileSync(path.join(ROOT, file), "utf8");

test("Phase 2 readiness endpoint is GET-only and imports no mutation path", () => {
  const route = read("app/api/investing/intelligence/readiness/route.ts");
  const reader = read("app/lib/investing/intelligence/readiness.ts");
  assert.match(route, /export async function GET/);
  assert.doesNotMatch(route, /export async function (POST|PUT|PATCH|DELETE)/);
  assert.doesNotMatch(`${route}\n${reader}`, /save|upsert|append|execute|publish|trade|order|recordSnapshot/);
});

test("readiness projection exposes no secret values or private investment records", () => {
  const reader = read("app/lib/investing/intelligence/readiness.ts");
  const projection = read("app/lib/investing/intelligence/readinessProjection.ts");
  assert.match(reader, /Boolean\(process\.env\.FRED_API_KEY\)/);
  assert.match(reader, /Boolean\(process\.env\.SEC_USER_AGENT\)/);
  assert.match(reader, /Boolean\(process\.env\.SERPAPI_KEY\)/);
  assert.doesNotMatch(`${reader}\n${projection}`, /positions\s*:/);
  assert.doesNotMatch(`${reader}\n${projection}`, /totalValueJpy|quantity|avgCost|currentPrice|raw provider/i);
});

test("Portfolio readiness inventory bypasses revaluation and returns metadata only", () => {
  const portfolio = read("app/lib/investing/portfolio.ts");
  const inventory = portfolio.slice(portfolio.indexOf("export async function loadPortfolioInventory"));
  assert.match(inventory, /loadFromHoldings/);
  assert.match(inventory, /positionCount/);
  assert.doesNotMatch(inventory, /revaluePositions|marketValueJpy|totalValueJpy/);
});

test("readiness documentation preserves Human Gate and no-trade boundaries", () => {
  const doc = read("docs/INVESTMENT_INTELLIGENCE_PHASE2_READINESS.md");
  assert.match(doc, /Human Review remains mandatory/);
  assert.match(doc, /Auto Trade/);
  assert.match(doc, /NOT_CONFIGURED/);
  assert.match(doc, /synthetic data/);
});
