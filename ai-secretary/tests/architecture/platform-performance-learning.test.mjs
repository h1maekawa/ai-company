import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";

const read = (path) => fs.readFileSync(path, "utf8");
function load(path, imports = {}) {
  const source = read(path);
  const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const exports = {};
  vm.runInNewContext(js, { exports, require: (name) => imports[name] ?? (() => { throw new Error(`unexpected import ${name}`); })(), console, Date, Map, Set, Object, Math });
  return exports;
}

const adapters = load("app/lib/content/platform-intelligence/adapters.ts");
const baselines = load("app/lib/content/platform-intelligence/baselines.ts");
const comparisons = load("app/lib/content/platform-intelligence/comparisons.ts");
const experiments = load("app/lib/content/platform-intelligence/experiments.ts", {
  "../../note/growthLoop": { growthConfidence: (count) => count >= 10 ? "high" : count >= 3 ? "medium" : "low" },
});

const xRecord = (overrides = {}) => ({
  contentId: "x-1", platform: "x", purpose: "reach", genreId: "ai", publishedAt: "2026-10-07T00:00:00.000Z",
  measuredAt: "2026-10-07T01:00:00.000Z", ...overrides,
});
const published = (overrides = {}) => ({
  id: "pub-1", channel: "x", contentId: "x-1", title: "x", publishedAt: "2026-10-07T00:00:00.000Z",
  offerIds: [], ctaIds: [], status: "published", ...overrides,
});

test("ContentPlatform SSOT is imported rather than redefined", () => {
  for (const file of ["types.ts", "adapters.ts", "experiments.ts"]) {
    const source = read(`app/lib/content/platform-intelligence/${file}`);
    assert.match(source, /import type \{ ContentPlatform \} from "\.\.\/brandProfile"/);
    assert.doesNotMatch(source, /type ContentPlatform\s*=/);
  }
});

test("missing metrics stay null while an observed zero stays zero", () => {
  const projection = adapters.adaptPlatformPerformance({ platform: "x", performance: [xRecord({ impressions: 0 })] });
  assert.equal(projection.records[0].metrics.impressions, 0);
  assert.equal(projection.records[0].metrics.likes, null);
  assert.equal(projection.records[0].metrics.profileVisits, null);
  assert.equal(projection.records[0].metrics.revenue, null);
});

test("Instagram remains NOT_CONFIGURED with no records or fake metrics", () => {
  const projection = adapters.adaptPlatformPerformance({ platform: "instagram", performance: [] });
  assert.equal(projection.freshness, "not_configured");
  assert.equal(projection.records.length, 0);
});

test("X and Note adapters map only observed platform metrics", () => {
  const x = adapters.adaptPlatformPerformance({ platform: "x", performance: [xRecord({ impressions: 120, bookmarks: 4, linkClicks: 0 })] }).records[0];
  assert.deepEqual([x.metrics.impressions, x.metrics.saves, x.metrics.linkClicks, x.metrics.views], [120, 4, 0, null]);
  const note = adapters.adaptPlatformPerformance({ platform: "note", performance: [xRecord({ platform: "note", noteViews: 80, noteLikes: 3, noteSales: 0 })] }).records[0];
  assert.deepEqual([note.metrics.views, note.metrics.likes, note.metrics.conversions, note.metrics.shares], [80, 3, 0, null]);
});

test("ContentPerformance wins over PerformanceSnapshot without double counting", () => {
  const projection = adapters.adaptPlatformPerformance({
    platform: "x", performance: [xRecord({ impressions: 100 })], published: [published()],
    snapshots: [{ id: "snap-1", publishedContentId: "pub-1", capturedAt: "2026-10-07T02:00:00.000Z", impressions: 999, source: "api" }],
  });
  assert.equal(projection.records.length, 1);
  assert.equal(projection.records[0].metrics.impressions, 100);
  assert.equal(projection.records[0].source.kind, "content-performance");
});

test("Revenue attribution distinguishes unavailable from formally observed zero", () => {
  const without = adapters.adaptPlatformPerformance({ platform: "x", performance: [xRecord()], published: [published()], revenueEvents: [] });
  assert.equal(without.records[0].metrics.revenue, null);
  const withZero = adapters.adaptPlatformPerformance({
    platform: "x", performance: [xRecord()], published: [published()],
    revenueEvents: [{ id: "rev-0", publishedContentId: "pub-1", type: "affiliate", amount: 0, currency: "JPY", occurredAt: "2026-10-07T03:00:00.000Z", source: "api" }],
  });
  assert.equal(withZero.records[0].metrics.revenue, 0);
  const snapshotOnly = adapters.adaptPlatformPerformance({
    platform: "x", performance: [], published: [published()],
    snapshots: [{ id: "snap-revenue", publishedContentId: "pub-1", capturedAt: "2026-10-07T02:00:00.000Z", revenue: 999, source: "api" }],
  });
  assert.equal(snapshotOnly.records[0].metrics.revenue, null);
});

test("baseline uses median and requires at least three fresh samples", () => {
  const now = new Date("2026-10-08T00:00:00.000Z");
  const projection = (values) => ({ platform: "x", freshness: "fresh", records: values.map((value, index) => adapters.adaptPlatformPerformance({ platform: "x", performance: [xRecord({ contentId: `x-${index}`, impressions: value })] }).records[0]) });
  assert.equal(baselines.calculateBaseline({ projection: projection([]), metric: "impressions", window: "7d", now }).status, "insufficient_data");
  assert.equal(baselines.calculateBaseline({ projection: projection([10, 20]), metric: "impressions", window: "7d", now }).status, "insufficient_data");
  const baseline = baselines.calculateBaseline({ projection: projection([10, 1000, 20]), metric: "impressions", window: "7d", now });
  assert.equal(baseline.status, "available"); assert.equal(baseline.sampleSize, 3); assert.equal(baseline.value, 20);
});

test("comparison never labels insufficient evidence as growth", () => {
  const insufficient = comparisons.compareWithBaseline(20, { platform: "x", metric: "impressions", value: null, sampleSize: 2, window: "7d", status: "insufficient_data" });
  assert.deepEqual([insufficient.status, insufficient.delta, insufficient.deltaRate], ["insufficient_data", null, null]);
  const available = comparisons.compareWithBaseline(30, { platform: "x", metric: "impressions", value: 20, sampleSize: 3, window: "7d", status: "available" });
  assert.deepEqual([available.status, available.delta, available.deltaRate], ["available", 10, 50]);
});

test("Learning evidence and Experiment output are candidate-only", () => {
  const learning = experiments.learningEvidence({ learning: { id: "l1", period: "7d", sourceContentIds: [], sourcePerformanceIds: [], observation: "3件のmedianが20", interpretation: "関連している可能性", status: "approved", createdAt: "2026-10-08T00:00:00.000Z" }, platform: "x", metricKeys: ["impressions"], evidenceCount: 3 });
  assert.equal(learning.status, "candidate"); assert.equal(learning.confidence, "medium");
  const experiment = experiments.createExperimentCandidate({ id: "e1", platform: "x", hypothesis: "関連の可能性", variableKey: "hook", experimentValue: "question", primaryMetric: "replies", sourceLearningIds: ["l1"], createdAt: "2026-10-08T00:00:00.000Z" });
  assert.equal(experiment.status, "candidate"); assert.equal(experiment.variableKey, "hook"); assert.equal("variableKeys" in experiment, false);
});

test("X Dashboard reads the adapter and preserves KPI semantics", () => {
  const deriveMetrics = ({ impressions, totalRevenue }) => ({ revenuePer1000Impressions: impressions === undefined || totalRevenue === undefined || impressions === 0 ? undefined : totalRevenue / (impressions / 1000) });
  const dashboardModule = load("app/lib/content/xDashboard.ts", {
    "./monetization/metrics": { deriveMetrics },
    "../note/contentDashboardGrowth": { buildContentDashboardGrowth: () => ({ status: "UNAVAILABLE", observations: [] }) },
    "../note/tokyoDate": { tokyoDateKey: (date) => date.toISOString().slice(0, 10) },
    "./platform-intelligence/adapters": adapters,
  });
  const records = [xRecord({ contentId: "x-1", impressions: 100, profileVisits: 4, linkClicks: 2 }), xRecord({ contentId: "x-2", impressions: 200, profileVisits: 6, linkClicks: 3 })];
  const result = dashboardModule.buildXDashboard({ now: new Date("2026-10-08T00:00:00.000Z"), mode: "draft", records, reviews: [], plans: [], drafts: [], published: [], revenueEvents: [] });
  assert.deepEqual([result.metrics.sevenDays.impressions, result.metrics.sevenDays.postCount, result.metrics.sevenDays.profileVisits, result.metrics.sevenDays.linkClicks, result.metrics.sevenDays.revenue], [300, 2, 10, 5, null]);
  assert.equal(result.topContent[0].id, "x-2");
});

test("foundation adds no persistence or automation surface", () => {
  const files = ["adapters.ts", "baselines.ts", "comparisons.ts", "experiments.ts"].map((file) => read(`app/lib/content/platform-intelligence/${file}`)).join("\n");
  assert.doesNotMatch(files, /save[A-Z]|writeJson|Redis|createTable|DailyXPlan|PurposeMix/);
  assert.doesNotMatch(files, /auto.*approved/i);
});
