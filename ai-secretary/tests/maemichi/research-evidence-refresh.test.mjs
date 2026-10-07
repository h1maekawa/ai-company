import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";

const { reconcileFetchedResearchItems } = await import(path.join(process.env.MAEMICHI_DIST, "note/research/evidenceRefresh.js"));

const old = {
  id: "r1", sourceUrl: "https://note.com/alice/n/one", sourceAccountId: "legacy-id", platform: "note",
  title: "Original title", textExcerpt: "approved excerpt", hookPattern: "結論から提示する",
  fetchedAt: "2026-10-01T00:00:00Z", publicMetrics: { likes: 2 },
};

test("同一URL再取得は本文や型を変えず、観測された公開evidenceだけを更新", () => {
  const observed = { ...old, sourceAccountId: "alice", textExcerpt: "new external excerpt", hookPattern: undefined, fetchedAt: "2026-10-08T00:00:00Z", publishedAt: "2026-10-07T00:00:00Z", publicMetrics: { likes: 9 } };
  const { fresh, refreshed } = reconcileFetchedResearchItems([old], [observed]);
  assert.equal(fresh.length, 0);
  assert.equal(refreshed[0].textExcerpt, old.textExcerpt);
  assert.equal(refreshed[0].hookPattern, old.hookPattern);
  assert.equal(refreshed[0].sourceAccountId, "alice");
  assert.equal(refreshed[0].publicMetrics.likes, 9);
  assert.equal(refreshed[0].publishedAt, observed.publishedAt);
});

test("provider欠損・不正値はmetricsやpublishedAtを捏造せず、同run重複URLも1件にする", () => {
  const bad = { ...old, publicMetrics: { likes: -3 }, publishedAt: "unknown", fetchedAt: "2026-10-08T00:00:00Z" };
  const { fresh, refreshed } = reconcileFetchedResearchItems([old], [bad]);
  assert.equal(fresh.length, 0);
  assert.equal(refreshed[0].publicMetrics.likes, 2);
  assert.equal(refreshed[0].publishedAt, undefined);
  const newItem = { ...old, id: "r2", sourceUrl: "https://note.com/bob/n/two" };
  assert.equal(reconcileFetchedResearchItems([], [newItem, { ...newItem, publicMetrics: { likes: 5 } }]).fresh.length, 1);
});
