import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";

const DIST = process.env.MAEMICHI_DIST;
const lifecycle = await import(path.join(DIST, "note/automation/queueLifecycle.js"));
const NOW = new Date("2026-10-07T00:00:00.000Z");
const draft = (id, overrides = {}) => ({
  id, xAccountId: "primary", purpose: "reach", genreId: "ai", text: id, urls: [], needsDisclosure: false,
  status: "draft", createdAt: "2026-09-29T00:00:00.000Z", updatedAt: "2026-09-29T00:00:00.000Z", ...overrides,
});

test("Queue Lifecycleは未解決20件でglobal backpressure、同一topic 3件でtopic saturationを返す", () => {
  const drafts = Array.from({ length: 20 }, (_, i) => draft(`d${i}`, { trendClusterId: i < 3 ? "topic-a" : `topic-${i}` }));
  const result = lifecycle.deriveQueueLifecycle(drafts, { now: NOW });
  assert.equal(result.backpressure, true);
  assert.equal(result.activeUnresolved, 20);
  assert.equal(result.unresolvedByTopic["topic-a"], 3);
  assert.match(result.reasons.join(" "), /active unresolved/);
  assert.deepEqual(result.saturatedTopics, ["topic-a"]);
  assert.doesNotMatch(result.reasons.join(" "), /topic-a/);
});

test("未解決19件でtopic 3件はglobal backpressureにしない", () => {
  const drafts = Array.from({ length: 19 }, (_, i) => draft(`d${i}`, { trendClusterId: i < 3 ? "topic-a" : `topic-${i}` }));
  const result = lifecycle.deriveQueueLifecycle(drafts, { now: NOW });
  assert.equal(result.backpressure, false);
  assert.equal(result.activeUnresolved, 19);
  assert.deepEqual(result.saturatedTopics, ["topic-a"]);
});

test("外部link付きとold scheduledはcleanup候補にせずreconciliation表示だけにする", () => {
  const linked = draft("linked", { status: "scheduled", bufferPostId: "buf-1", bufferExternalLink: "https://x.com/example/status/1" });
  const result = lifecycle.deriveQueueLifecycle([linked], { now: NOW });
  assert.deepEqual(result.entries[0].derivedStates.sort(), ["linked_pending_reconciliation", "stale"].sort());
  assert.equal(result.entries[0].cleanupProtected, true);
});

test("7日超の未link draftだけcleanup_candidateを導出する（削除はしない）", () => {
  const result = lifecycle.deriveQueueLifecycle([draft("old")], { now: NOW });
  assert.ok(result.entries[0].derivedStates.includes("cleanup_candidate"));
  assert.ok(result.entries[0].derivedStates.includes("needs_review"));
});
