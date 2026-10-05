import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";

const dashboard = await import(path.join(process.env.MAEMICHI_DIST, "note/contentDashboardGrowth.js"));
const review = (overrides = {}) => ({
  measuredThrough:"2026-10-04T12:00:00Z", confidence:"medium", evidenceCount:3,
  comparisons:{last7Days:{postCount:3,impressions:1200},last30Days:{postCount:4},previous7Days:{postCount:0},yesterday:{postCount:0},last28Days:{postCount:0}},
  bestContent:{contentId:"own-1"}, competitorDifferences:["3件中2件が数字始まり","raw competitor text"],
  experiments:["[hook] 次の3投稿で数字Hookを検証"], ...overrides,
});

test("Content dashboard keeps missing metrics null and exposes no raw competitor text", () => {
  const result = dashboard.buildContentDashboardGrowth(review());
  assert.equal(result.status,"AVAILABLE"); assert.equal(result.impressions30d,null); assert.equal(result.bestContent.impressions,null);
  assert.deepEqual(result.observations,["3件中2件が数字始まり"]); assert.doesNotMatch(JSON.stringify(result),/raw competitor text/);
});

test("fewer than three comparable samples stays INSUFFICIENT_DATA", () => {
  const result = dashboard.buildContentDashboardGrowth(review({evidenceCount:2,confidence:"low"}));
  assert.equal(result.status,"INSUFFICIENT_DATA"); assert.deepEqual(result.observations,[]); assert.equal(result.nextExperiment,null);
});

test("missing review stays unavailable instead of inventing zero", () => {
  const result = dashboard.buildContentDashboardGrowth();
  assert.equal(result.status,"UNAVAILABLE"); assert.equal(result.impressions7d,null); assert.equal(result.impressions30d,null);
  assert.equal(result.evidenceCount,null);
});

test("legacy review with missing comparisons degrades without inventing zero", () => {
  const result = dashboard.buildContentDashboardGrowth({ measuredThrough:"2026-10-01T00:00:00Z" });
  assert.equal(result.status,"INSUFFICIENT_DATA");
  assert.equal(result.impressions7d,null); assert.equal(result.impressions30d,null);
  assert.equal(result.evidenceCount,null); assert.equal(result.confidence,null);
});
