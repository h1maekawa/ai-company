import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";

const DIST = process.env.MAEMICHI_DIST;
const metrics = await import(path.join(DIST, "note/publishing/xMetrics.js"));

const draft = {
  id: "d1", trendClusterId: "topic-a", xAccountId: "x", purpose: "reach", genreId: "ai",
  text: "AI活用を小さく試す。", urls: [], needsDisclosure: false, status: "published",
  bufferPostId: "buffer-1", scheduledAt: "2026-08-20T22:30:00.000Z", createdAt: "", updatedAt: "",
};

test("X投稿は本文と時刻でX Post IDへ紐付く", () => {
  const matched = metrics.matchPublishedPost(draft, [
    { id: "old", text: draft.text, created_at: "2026-08-19T22:30:00.000Z" },
    { id: "right", text: draft.text, created_at: "2026-08-20T22:31:00.000Z" },
  ]);
  assert.equal(matched.id, "right");
});

test("Metrics取得成功は実値だけ保存し取得不能値をunavailableにする", async () => {
  process.env.X_API_BEARER_TOKEN = "test-token";
  process.env.X_API_USER_ID = "u1";
  const original = globalThis.fetch;
  globalThis.fetch = async (url) => new Response(JSON.stringify(
    String(url).includes("/users/")
      ? { data: [{ id: "post-1", text: draft.text, created_at: draft.scheduledAt }] }
      : { data: { id: "post-1", text: draft.text, created_at: draft.scheduledAt, public_metrics: { impression_count: 1000, like_count: 20, reply_count: 3, retweet_count: 4 } } }
  ), { status: 200 });
  try {
    const result = await metrics.fetchXMetrics(draft, new Date("2026-08-21T22:30:00.000Z"));
    assert.equal(result.ok, true);
    assert.equal(result.metrics.impressions, 1000);
    assert.equal(result.metrics.metricAvailability.profileVisits, "unavailable");
    assert.equal(result.metrics.metricAvailability.followersGained, "unavailable");
  } finally {
    globalThis.fetch = original;
    delete process.env.X_API_BEARER_TOKEN;
    delete process.env.X_API_USER_ID;
  }
});

test("X API障害はretryableで投稿データを変更しない", async () => {
  process.env.X_API_BEARER_TOKEN = "test-token";
  process.env.X_API_USER_ID = "u1";
  const original = globalThis.fetch;
  globalThis.fetch = async () => new Response("rate limited", { status: 429 });
  try {
    const result = await metrics.fetchXMetrics(draft);
    assert.deepEqual(result, { ok: false, retryable: true, error: "X API 429" });
    assert.equal(draft.xPostId, undefined);
  } finally {
    globalThis.fetch = original;
    delete process.env.X_API_BEARER_TOKEN;
    delete process.env.X_API_USER_ID;
  }
});
