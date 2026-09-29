import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const read = (file) => fs.readFileSync(path.join(ROOT, file), "utf8");

test("Investment Intelligence is evidence-first and fail-closed", () => {
  const engine = read("app/lib/investing/intelligence/engine.ts");
  assert.match(engine, /freshEvidence/);
  assert.match(engine, /DATA_INCOMPLETE/);
  assert.match(engine, /coverage >= 0\.8/);
  assert.doesNotMatch(engine, /BUY|broker|order/i);
});

test("Opportunity decision remains a human record and never executes a trade", () => {
  const route = read("app/api/investing/opportunities/[id]/decision/route.ts");
  assert.match(route, /Invalid origin/);
  assert.match(route, /appendInvestmentDecision/);
  assert.doesNotMatch(route, /execute|broker|order|trade/i);
});

test("Investment Intelligence exposes responsive decision routes", () => {
  for (const file of [
    "app/investing/market/page.tsx",
    "app/investing/opportunities/page.tsx",
    "app/investing/opportunities/[id]/page.tsx",
    "app/api/investing/intelligence/today/route.ts",
    "app/api/cron/investing-macro-news/route.ts",
    "app/api/cron/investing-market-sector/route.ts",
    "app/api/cron/investing-opportunity-scan/route.ts",
    "app/api/cron/investing-notify/route.ts",
  ]) assert.ok(fs.existsSync(path.join(ROOT, file)), `${file} must exist`);
  const detail = read("app/investing/opportunities/[id]/page.tsx");
  assert.match(detail, /Bull \/ Base \/ Bear/);
  assert.match(detail, /Evidence \/ Source \/ Freshness/);
  assert.match(detail, /GO候補として保存/);
});
