import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read = (path) => fs.readFileSync(path, "utf8");

test("X opens as an analytics-first dashboard", () => {
  const page = read("app/content/x/page.tsx");
  for (const label of ["Impressions", "Performance", "AI Learning", "今日の投稿", "Top Content", "Attention"]) {
    assert.match(page, new RegExp(label));
  }
  assert.match(page, /useState<XDashboardRange>\("sevenDays"\)/);
});

test("existing X Studio remains available through Content view", () => {
  const page = read("app/content/x/page.tsx");
  assert.match(page, /view === "content" && <ContentStudio/);
  for (const label of ["Material", "Draft", "Review", "Published", "新しいX下書き", "下書き一覧"]) {
    assert.match(page, new RegExp(label));
  }
  assert.match(page, /\/api\/content\/x\/drafts/);
});

test("missing X metrics remain null and render as an em dash", () => {
  const model = read("app/lib/content/xDashboard.ts");
  const adapter = read("app/lib/content/platform-intelligence/adapters.ts");
  const page = read("app/content/x/page.tsx");
  assert.match(model, /averageImpressionsPerPost: number \| null/);
  assert.match(model, /revenuePer1000Impressions: number \| null/);
  assert.match(model, /impressions: sumObserved/);
  assert.match(model, /record\.freshness === "fresh"/);
  assert.match(adapter, /record\.metricsStale === true \? "stale"/);
  assert.match(page, /value === null \|\| value === undefined \? "—"/);
  assert.doesNotMatch(model, /impressions:\s*[^\n]*\|\|\s*0/);
});

test("Growth Review fields are reused without a new learning store", () => {
  const model = read("app/lib/content/xDashboard.ts");
  const route = read("app/api/content/x/dashboard/route.ts");
  assert.match(model, /buildContentDashboardGrowth\(latestReview\)/);
  assert.match(route, /loadGrowthReviews/);
  const page = read("app/content/x/page.tsx");
  for (const field of ["evidenceCount", "confidence", "observations", "nextExperiment"]) assert.match(page, new RegExp(field));
});

test("DailyX Plan is read-only and status translation stays in the UI", () => {
  const route = read("app/api/content/x/dashboard/route.ts");
  const page = read("app/content/x/page.tsx");
  assert.match(route, /loadDailyXPlans/);
  assert.doesNotMatch(route, /saveDailyXPlans|upsertDailyXPlan|POST|PATCH/);
  for (const status of ["planned", "generated", "scheduled", "published", "blocked", "failed", "ambiguous", "missed", "skipped"]) {
    assert.match(page, new RegExp(`${status}:`));
  }
});

test("X dashboard uses a read-only aggregator and introduces no store", () => {
  const route = read("app/api/content/x/dashboard/route.ts");
  for (const loader of ["loadPerformance", "loadGrowthReviews", "loadDailyXPlans", "loadSocialDrafts", "loadPublishedContent", "loadLedger"]) assert.match(route, new RegExp(loader));
  assert.doesNotMatch(route, /save[A-Z]|writeJson|createTable|prisma|sql/);
});
