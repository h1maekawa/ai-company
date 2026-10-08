import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import fs from "node:fs";

const DIST = process.env.MAEMICHI_DIST;
const buffer = await import(path.join(DIST, "note/publishing/buffer.js"));
const metrics = await import(path.join(DIST, "note/publishing/bufferMetrics.js"));
const canaryReconciliation = await import(path.join(DIST, "note/publishing/canaryReconciliation.js"));

const draft = {
  id: "d1", trendClusterId: "topic-a", xAccountId: "x", purpose: "reach", genreId: "ai",
  text: "AI活用を小さく試す。", urls: [], needsDisclosure: false, status: "published",
  bufferPostId: "buffer-1", scheduledAt: "2026-08-20T11:30:00.000Z", createdAt: "", updatedAt: "",
};

const sentPost = {
  id: "buffer-1", status: "sent", text: draft.text, dueAt: draft.scheduledAt,
  sentAt: "2026-08-20T11:31:00.000Z", externalLink: "https://x.com/example/status/1",
  metricsUpdatedAt: "2026-08-21T02:00:00.000Z",
  metrics: [
    { type: "impressions", name: "Impressions", value: 1200, unit: "count" },
    { type: "reactions", name: "Reactions", value: 30, unit: "count" },
    { type: "comments", name: "Comments", value: 4, unit: "count" },
    { type: "reposts", name: "Reposts", value: 5, unit: "count" },
    { type: "clicks", name: "Clicks", value: 7, unit: "count" },
  ],
};

test("Buffer sent postからMetrics・更新時刻・externalLinkを取得する", async () => {
  process.env.BUFFER_API_KEY = "test";
  process.env.BUFFER_ORGANIZATION_ID = "org";
  process.env.BUFFER_X_CHANNEL_ID = "channel";
  const original = globalThis.fetch;
  globalThis.fetch = async (_url, init) => {
    const request = JSON.parse(init.body);
    assert.match(request.query, /query Post\(\$id: PostId!\)/);
    assert.match(request.query, /externalLink/);
    assert.match(request.query, /metricsUpdatedAt/);
    return new Response(JSON.stringify({ data: { post: sentPost } }), { status: 200 });
  };
  try {
    const result = await buffer.getPost("buffer-1");
    assert.equal(result.ok, true);
    assert.equal(result.data.status, "sent");
    assert.equal(result.data.externalLink, sentPost.externalLink);
    assert.equal(result.data.metricsUpdatedAt, sentPost.metricsUpdatedAt);
  } finally {
    globalThis.fetch = original;
    delete process.env.BUFFER_API_KEY;
    delete process.env.BUFFER_ORGANIZATION_ID;
    delete process.env.BUFFER_X_CHANNEL_ID;
  }
});

test("Buffer Metricsを共通ContentPerformanceへNormalizeし欠損はunavailableにする", () => {
  const record = metrics.normalizeBufferMetrics(draft, sentPost, new Date("2026-08-21T03:00:00.000Z"));
  assert.equal(record.impressions, 1200);
  assert.equal(record.likes, 30);
  assert.equal(record.replies, 4);
  assert.equal(record.reposts, 5);
  assert.equal(record.linkClicks, 7);
  assert.equal(record.engagements, undefined);
  assert.equal(record.profileVisits, undefined);
  assert.equal(record.metricAvailability.engagements, "unavailable");
  assert.equal(record.metricAvailability.linkClicks, "available");
});

test("Metrics欠損・unexpected shape・API errorは保存せず再試行可能にする", async () => {
  const missing = await metrics.fetchBufferMetrics(draft, new Date(), async () => ({
    ok: true, data: { ...sentPost, metrics: null, metricsUpdatedAt: null },
  }));
  assert.equal(missing.ok, false);
  assert.equal(missing.retryable, true);

  const unexpected = metrics.normalizeBufferMetrics(draft, {
    ...sentPost, metrics: [{ type: "impressions", value: "broken" }],
  });
  assert.equal(unexpected.impressions, undefined);
  assert.equal(unexpected.metricAvailability.impressions, "unavailable");
  const unsupported = await metrics.fetchBufferMetrics(draft, new Date(), async () => ({
    ok: true, data: { ...sentPost, metrics: [{ type: "future_metric", value: 10 }] },
  }));
  assert.equal(unsupported.ok, false);
  assert.equal(unsupported.retryable, true);

  const failed = await metrics.fetchBufferMetrics(draft, new Date(), async () => ({
    ok: false, error: { kind: "network", message: "temporary" },
  }));
  assert.deepEqual(failed, { ok: false, retryable: true, error: "temporary" });
});

test("Performance SyncはNightly Reviewへ統合されVercel Hobby対応のdaily schedule", () => {
  const config = JSON.parse(fs.readFileSync(path.join(process.cwd(), "vercel.json"), "utf8"));
  const cron = config.crons.find((item) => item.path === "/api/cron/content-nightly-review");
  assert.deepEqual(cron, { path: "/api/cron/content-nightly-review", schedule: "30 14 * * *" });
  assert.equal(config.crons.some((item) => item.path === "/api/cron/x-performance-sync"), false);
});

test("Daily候補は前日以前で、同一metricsUpdatedAtは重複保存しない", () => {
  const now = new Date("2026-08-21T03:00:00.000Z");
  assert.equal(metrics.isDailyMetricsCandidate(draft, now), true);
  assert.equal(metrics.isDailyMetricsCandidate({ ...draft, scheduledAt: "2026-08-21T00:00:00.000Z" }, now), false);
  const synced = { ...draft, bufferMetricsUpdatedAt: sentPost.metricsUpdatedAt };
  assert.equal(metrics.hasNewerBufferMetrics(synced, sentPost.metricsUpdatedAt, true), false);
  assert.equal(metrics.hasNewerBufferMetrics(synced, "2026-08-22T02:00:00.000Z", true), true);
  assert.equal(metrics.hasNewerBufferMetrics(synced, sentPost.metricsUpdatedAt, false), true);
  const first = metrics.normalizeBufferMetrics(draft, sentPost);
  const same = metrics.normalizeBufferMetrics(draft, { ...sentPost, metricsUpdatedAt: "2026-08-22T02:00:00.000Z" });
  const changed = { ...same, likes: same.likes + 1 };
  assert.equal(metrics.samePerformanceValues(first, same), true);
  assert.equal(metrics.samePerformanceValues(first, changed), false);
});

test("X API envがなくてもBuffer Metrics Providerは正常動作する", async () => {
  delete process.env.X_API_USER_ID;
  delete process.env.X_API_BEARER_TOKEN;
  delete process.env.X_API_USER_ACCESS_TOKEN;
  const result = await metrics.fetchBufferMetrics(draft, new Date(), async () => ({ ok: true, data: sentPost }));
  assert.equal(result.ok, true);
  assert.equal(result.providerUpdatedAt, sentPost.metricsUpdatedAt);
});

test("one-time Canaryだけ当日夜にX公開証跡を同期し、未取得Metricsはunavailableのままにする", async () => {
  const canary = {
    ...draft, id: "x-canary-daily-x:2026-10-08:primary:slot-1",
    planId: "daily-x:2026-10-08:primary", planSlotId: "slot-1",
    scheduledAt: "2026-10-07T16:56:00.000Z", status: "queued",
  };
  const now = new Date("2026-10-08T14:30:00.000Z");
  assert.equal(metrics.isDailyMetricsCandidate(canary, now), true);
  assert.equal(metrics.isDailyMetricsCandidate({ ...canary, id: "normal-draft" }, now), false);
  assert.equal(metrics.isDailyMetricsCandidate(canary, new Date("2026-10-07T16:55:00.000Z")), false);
  const sentWithoutMetrics = {
    ...sentPost, id: canary.bufferPostId, dueAt: canary.scheduledAt,
    sentAt: "2026-10-07T16:56:10.000Z", metrics: null, metricsUpdatedAt: null,
    externalLink: "https://x.com/maemichi44/status/2107877739529170991",
  };
  const result = await metrics.fetchBufferMetrics(canary, now, async () => ({ ok: true, data: sentWithoutMetrics }));
  assert.equal(result.ok, true);
  assert.equal(result.providerUpdatedAt, sentWithoutMetrics.sentAt);
  assert.equal(result.metrics.impressions, undefined);
  assert.equal(result.metrics.metricAvailability.impressions, "unavailable");
  const noXLink = await metrics.fetchBufferMetrics(canary, now, async () => ({ ok: true, data: { ...sentWithoutMetrics, externalLink: null } }));
  assert.equal(noXLink.ok, false);
  const normal = await metrics.fetchBufferMetrics({ ...canary, id: "normal-draft" }, now, async () => ({ ok: true, data: sentWithoutMetrics }));
  assert.equal(normal.ok, false);
});

test("Canary Publication Evidence queryはMetrics failureから独立して公開を確定する", async () => {
  process.env.BUFFER_API_KEY = "test";
  process.env.BUFFER_ORGANIZATION_ID = "org";
  process.env.BUFFER_X_CHANNEL_ID = "channel";
  const canary = {
    ...draft, id: "x-canary-plan:slot-1", planId: "plan", planSlotId: "slot-1",
    status: "queued", publishedAt: undefined, xPostId: undefined, bufferExternalLink: undefined,
  };
  const evidence = {
    id: canary.bufferPostId, status: "sent", dueAt: canary.scheduledAt,
    sentAt: "2026-10-08T00:00:00.000Z",
    externalLink: "https://x.com/maemichi44/status/2107877739529170991",
  };
  const queries = [];
  const original = globalThis.fetch;
  globalThis.fetch = async (_url, init) => {
    const request = JSON.parse(init.body);
    queries.push(request.query);
    if (request.query.includes("PostPublicationEvidence")) {
      assert.doesNotMatch(request.query, /metrics/i);
      assert.match(request.query, /posts\(/);
      assert.match(request.query, /status: \[sent\]/);
      return new Response(JSON.stringify({ data: { posts: { edges: [
        { node: { ...evidence, id: "another-buffer-post" } },
        { node: evidence },
      ] } } }), { status: 200 });
    }
    return new Response(JSON.stringify({ errors: [{ message: "metrics unavailable" }] }), { status: 200 });
  };
  try {
    const publication = await buffer.getPostPublicationEvidence(canary.bufferPostId);
    assert.equal(publication.ok, true);
    const confirmed = canaryReconciliation.confirmCanaryPublication(canary, publication.data);
    assert.equal(confirmed.ok, true);
    assert.equal(confirmed.draft.status, "published");
    assert.equal(confirmed.draft.xPostId, "2107877739529170991");
    assert.equal(confirmed.draft.bufferExternalLink, evidence.externalLink);
    assert.equal(confirmed.draft.publishedAt, evidence.sentAt);
    const metricResult = await buffer.getPostMetrics(canary.bufferPostId);
    assert.equal(metricResult.ok, false);
    assert.equal(confirmed.draft.status, "published");
    assert.equal(queries.length, 2);
  } finally {
    globalThis.fetch = original;
    delete process.env.BUFFER_API_KEY;
    delete process.env.BUFFER_ORGANIZATION_ID;
    delete process.env.BUFFER_X_CHANNEL_ID;
  }
});

test("Canary Publicationは未送信・link欠損・非X URLをfail closedにする", () => {
  const canary = {
    ...draft, id: "x-canary-plan:slot-1", planId: "plan", planSlotId: "slot-1", status: "queued",
  };
  const base = {
    id: canary.bufferPostId, status: "sent", sentAt: "2026-10-08T00:00:00.000Z",
    externalLink: "https://x.com/maemichi44/status/2107877739529170991",
  };
  assert.deepEqual(
    canaryReconciliation.confirmCanaryPublication(canary, { ...base, status: "scheduled" }),
    { ok: false, reason: "BUFFER_POST_NOT_SENT" }
  );
  assert.deepEqual(
    canaryReconciliation.confirmCanaryPublication(canary, { ...base, externalLink: undefined }),
    { ok: false, reason: "BUFFER_EXTERNAL_LINK_MISSING" }
  );
  assert.deepEqual(
    canaryReconciliation.confirmCanaryPublication(canary, { ...base, externalLink: "https://example.com/post/1" }),
    { ok: false, reason: "INVALID_X_EXTERNAL_LINK" }
  );
});

test("Canary Publication query timeoutはambiguousで、自動retryや状態昇格を行わない", async () => {
  process.env.BUFFER_API_KEY = "test";
  process.env.BUFFER_ORGANIZATION_ID = "org";
  process.env.BUFFER_X_CHANNEL_ID = "channel";
  const original = globalThis.fetch;
  globalThis.fetch = async () => { throw new Error("timeout"); };
  try {
    const result = await buffer.getPostPublicationEvidence("buffer-1");
    assert.equal(result.ok, false);
    assert.equal(result.error.kind, "ambiguous");
  } finally {
    globalThis.fetch = original;
    delete process.env.BUFFER_API_KEY;
    delete process.env.BUFFER_ORGANIZATION_ID;
    delete process.env.BUFFER_X_CHANNEL_ID;
  }
});

test("同一planId + planSlotIdの複数Canaryは全件をambiguous duplicateにする", () => {
  const base = {
    ...draft, id: "x-canary-a", planId: "plan", planSlotId: "slot-1", status: "queued",
  };
  const duplicates = canaryReconciliation.duplicateCanaryLineageIds([
    base, { ...base, id: "x-canary-b" }, { ...base, id: "normal-draft", planSlotId: "slot-2" },
  ]);
  assert.deepEqual([...duplicates].sort(), ["x-canary-a", "x-canary-b"]);
});
