import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";

const DIST = process.env.CONTENT_DIST;
const metrics = await import(path.join(DIST, "content/monetization/metrics.js"));

test("safeDivide: 分母0や欠損はundefined（0除算安全処理）", () => {
  assert.equal(metrics.safeDivide(10, 0), undefined);
  assert.equal(metrics.safeDivide(10, undefined), undefined);
  assert.equal(metrics.safeDivide(undefined, 10), undefined);
  assert.equal(metrics.safeDivide(null, 10), undefined);
  assert.equal(metrics.safeDivide(10, 2), 5);
});

test("deriveMetrics: データが揃っていない指標はundefined（欠損・ゼロ除算安全処理）", () => {
  const empty = metrics.deriveMetrics({});
  assert.equal(empty.ctr, undefined);
  assert.equal(empty.conversionRate, undefined);
  assert.equal(empty.revenuePerContent, undefined);

  const full = metrics.deriveMetrics({
    impressions: 1000,
    linkClicks: 50,
    ctaClicks: 10,
    conversions: 2,
    totalRevenue: 2000,
    contentCount: 4,
  });
  assert.equal(full.ctr, 5); // 50/1000*100
  assert.equal(full.revenuePerContent, 500);
});

test("revenueByContent: 1件のRevenueEventは1つのContentにのみ計上される（二重計上防止）", () => {
  const events = [
    { id: "r1", publishedContentId: "c1", type: "paid-note", amount: 1000, currency: "JPY", occurredAt: "2026-08-01T00:00:00Z", source: "manual" },
    { id: "r2", publishedContentId: "c1", type: "paid-note", amount: 500, currency: "JPY", occurredAt: "2026-08-02T00:00:00Z", source: "manual" },
    { id: "r3", publishedContentId: "c2", type: "affiliate", amount: 300, currency: "JPY", occurredAt: "2026-08-02T00:00:00Z", source: "manual" },
  ];
  const totals = metrics.revenueByContent(events);
  assert.equal(totals.get("c1"), 1500);
  assert.equal(totals.get("c2"), 300);
  // 全体合計が各Contentの合計と一致する＝二重計上されていない
  const sumOfContents = [...totals.values()].reduce((a, b) => a + b, 0);
  assert.equal(sumOfContents, metrics.totalRevenue(events));
});

test("buildAttributions: 1 RevenueEvent = 1 Attribution（構造的に二重計上できない）", () => {
  const events = [
    { id: "r1", publishedContentId: "c1", ctaId: "cta1", type: "paid-note", amount: 1000, currency: "JPY", occurredAt: "2026-08-01T00:00:00Z", source: "manual" },
    { id: "r2", publishedContentId: "c1", type: "affiliate", amount: 500, currency: "JPY", occurredAt: "2026-08-02T00:00:00Z", source: "manual" },
  ];
  const attributions = metrics.buildAttributions(events);
  assert.equal(attributions.length, 2);
  assert.equal(attributions[0].attributionType, "direct");
  assert.equal(attributions[1].attributionType, "assisted");
  assert.equal(new Set(attributions.map((a) => a.revenueEventId)).size, 2);
});

test("buildFunnel: 算出不能な段はnull（0にしない）", () => {
  const funnel = metrics.buildFunnel({ impressions: 1000, linkClicks: 20 });
  const byLabel = Object.fromEntries(funnel.map((f) => [f.label, f]));
  assert.equal(byLabel.impressions.value, 1000);
  assert.equal(byLabel.linkClicks.value, 20);
  assert.equal(byLabel.noteViews.value, null);
  assert.equal(byLabel.purchases.value, null);
  assert.equal(byLabel.linkClicks.rateFromPrevious, 2); // 20/1000*100
});

test("filterByPeriod: today/week/month/allで正しく絞り込む", () => {
  const now = new Date("2026-08-10T12:00:00Z");
  const items = [
    { occurredAt: "2026-08-10T01:00:00Z" }, // today
    { occurredAt: "2026-08-05T00:00:00Z" }, // within week
    { occurredAt: "2026-07-01T00:00:00Z" }, // old
  ];
  assert.equal(metrics.filterByPeriod(items, "today", now).length, 1);
  assert.equal(metrics.filterByPeriod(items, "week", now).length, 2);
  assert.equal(metrics.filterByPeriod(items, "all", now).length, 3);
});

test("weeklyReviewSummary: データが無ければneedsMoreData=true（数値を捏造しない）", () => {
  const summary = metrics.weeklyReviewSummary([], [], []);
  assert.equal(summary.needsMoreData, true);
  assert.equal(summary.revenue, 0);
});
