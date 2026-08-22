import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import fs from "node:fs";

const DIST = process.env.MAEMICHI_DIST;
const growth = await import(path.join(DIST, "note/growthLoop.js"));
const types = await import(path.join(DIST, "note/research/types.js"));
const safety = await import(path.join(DIST, "note/safetyRepair.js"));
const noteMetrics = await import(path.join(DIST, "note/publishing/noteMetricsProvider.js"));

const now = new Date("2026-08-22T14:30:00.000Z");
const day = 86_400_000;
const record = (id, daysAgo, overrides = {}) => ({
  contentId: id, trendClusterId: overrides.trendClusterId ?? "topic-ai", platform: "x",
  purpose: "reach", genreId: "ai", pattern: "opinion", draftType: "trend",
  postingSlot: "07:30", weightedLength: 240, hasCta: false, destination: "none",
  publishedAt: new Date(now.getTime() - daysAgo * day).toISOString(), measuredAt: now.toISOString(),
  impressions: 10000, likes: 500, replies: 100, reposts: 100, linkClicks: 50,
  ...overrides,
});

const weights = types.defaultPerformanceWeights();
const policy = types.defaultWinningTopicPolicy();

test("Nightly Reviewはyesterday/7d/previous7d/28dを分離しmissingを0にしない", () => {
  const records = [record("today", 0.5), record("week", 3), record("previous", 10), record("month", 20), record("missing", 0.2, { impressions: undefined, likes: undefined, replies: undefined, reposts: undefined, linkClicks: undefined })];
  const review = growth.buildDailyGrowthReview({ records, strategy: types.defaultContentGrowthStrategy(), weights, winningTopicPolicy: policy, now, noteFreshness: "stale" });
  assert.equal(review.xSummary.postCount, 2);
  assert.equal(review.comparisons.last7Days.postCount, 3);
  assert.equal(review.comparisons.previous7Days.postCount, 1);
  assert.equal(review.comparisons.last28Days.postCount, 5);
  assert.equal(review.dataFreshness.note, "stale");
  assert.equal(growth.summarizeX([record("m", 0, { impressions: undefined })]).impressions, undefined);
});

test("Winning Patternは複合軸で集計しminimum sample未満をwinnerにしない", () => {
  const enough = [1, 2, 3].map((n) => record(`w${n}`, n));
  const patterns = growth.aggregateGrowthPatterns([...enough, record("single", 1, { pattern: "save" })], weights, 3);
  assert.equal(patterns.find((item) => item.pattern === "opinion").winning, true);
  assert.equal(patterns.find((item) => item.pattern === "save").winning, false);
  assert.match(patterns[0].key, /topic-ai\|ai\|reach\|opinion/);
});

test("confidence gateは3件未満lowで戦略を自動変更しない", () => {
  const strategy = types.defaultContentGrowthStrategy();
  const review = growth.buildDailyGrowthReview({ records: [record("a", 1), record("b", 2)], strategy, weights, winningTopicPolicy: policy, now });
  assert.equal(review.confidence, "low");
  assert.deepEqual(review.strategyAfter, review.strategyBefore);
  assert.equal(review.appliedChanges.length, 0);
});

test("Purpose Mixはbounds・1晩最大10pt・exploration最低15%を守りrollback可能", () => {
  const strategy = { ...types.defaultContentGrowthStrategy(), explorationRate: 0 };
  const records = [
    ...[1, 2, 3, 4].map((n) => record(`r${n}`, n, { purpose: "reach", impressions: 5000 })),
    ...[1, 2, 3].map((n) => record(`n${n}`, n, { purpose: "note-bridge", impressions: 10, likes: 0, replies: 0, reposts: 0 })),
  ];
  const review = growth.buildDailyGrowthReview({ records, strategy, weights, winningTopicPolicy: policy, now });
  const before = review.strategyBefore.purposeMix;
  const after = review.strategyAfter.purposeMix;
  assert.ok(after.reach >= 50 && after.reach <= 80);
  assert.ok(after.noteBridge >= 10 && after.noteBridge <= 35);
  assert.ok(after.monetize >= 5 && after.monetize <= 20);
  assert.ok(Math.abs(after.reach - before.reach) <= 10);
  assert.ok(review.strategyAfter.explorationRate >= 15);
  assert.deepEqual(growth.rollbackStrategy(review), review.strategyBefore);
  assert.notStrictEqual(review.strategyBefore, review.strategyAfter);
});

test("note metricsは欠損をunavailableとして正規化する", () => {
  const article = { id: "n1", genreId: "ai", title: "記事", articleType: "paid", freeSection: "", tags: [], affiliateIds: [], needsDisclosure: false, sourceResearchItemIds: [], sourceExperienceIds: [], status: "published", createdAt: now.toISOString(), updatedAt: now.toISOString() };
  const metrics = noteMetrics.normalizeNoteMetrics(article, { views: 10 }, now);
  assert.equal(metrics.noteViews, 10);
  assert.equal(metrics.noteRevenue, undefined);
  assert.equal(metrics.metricAvailability.noteRevenue, "unavailable");
});

test("unverified experienceだけは1回repairし、secret等との複合違反はrepairしない", async () => {
  const brand = { personality: { avoidedExpressions: [] } };
  const draft = { id: "d", xAccountId: "x", purpose: "reach", genreId: "ai", text: "私が実際に試した方法です", urls: [], needsDisclosure: false, status: "draft", createdAt: "", updatedAt: "" };
  let calls = 0;
  const repaired = await safety.repairUnverifiedExperience({ draft, brand, experiences: [], repair: async () => { calls++; return "調べると、この方法があります"; } });
  assert.equal(repaired.repaired, true);
  assert.equal(calls, 1);
  const blocked = await safety.repairUnverifiedExperience({ draft: { ...draft, text: "私が実際に試した secret=abc" }, brand, experiences: [], repair: async () => { calls++; return "変更"; } });
  assert.equal(blocked.repaired, false);
  assert.equal(calls, 1);
});

test("Cron/UI/Human Approval/noteDraftOnlyの回帰契約", () => {
  const vercel = fs.readFileSync(path.join(process.cwd(), "vercel.json"), "utf8");
  const ui = fs.readFileSync(path.join(process.cwd(), "components/note/GrowthInsights.tsx"), "utf8");
  const runner = fs.readFileSync(path.join(process.cwd(), "app/api/local-runner/note/jobs/next/route.ts"), "utf8");
  assert.match(vercel, /content-nightly-review/);
  assert.match(vercel, /30 14 \* \* \*/);
  assert.doesNotMatch(vercel, /x-performance-sync/);
  assert.match(ui, /Follower data/);
  assert.match(ui, /Human Decision Needed/);
  assert.match(runner, /noteAutoPublish \|\| settings\.flags\.noteDraftOnly/);
});
