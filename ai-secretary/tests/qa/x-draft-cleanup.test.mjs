import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const cleanup = require(path.join(process.env.QA_DIST, "out/app/lib/note/maintenance/draftCleanup.js"));

const draft = (id, status, extra = {}) => ({ id, status, text: `本文${id}`, xAccountId: "a", purpose: "growth", genreId: "g", urls: [], needsDisclosure: false, ...extra });
const fixture = () => [
  draft("d1", "draft"), draft("d2", "approved"), draft("d3", "failed"), draft("d4", "discarded"),
  draft("q1", "queued", { bufferPostId: "b1" }), draft("s1", "scheduled", { bufferPostId: "b2", scheduledAt: "2026-09-25T00:00:00Z" }),
  draft("p1", "published", { bufferPostId: "b3", xPostId: "x1" }),
  draft("a-linked", "approved", { bufferPostId: "b4" }),
];

test("draft / approved / failed / discarded だけが削除対象。queued / scheduled / published は保持", () => {
  const plan = cleanup.planDraftCleanup(fixture());
  assert.deepEqual(plan.targets.map((t) => t.id), ["d1", "d2", "d3", "d4"]);
  const kept = cleanup.applyDraftCleanup(fixture(), plan).map((d) => d.id);
  assert.deepEqual(kept, ["q1", "s1", "p1", "a-linked"]);
});

test("対象statusでもBuffer / X紐付けがあれば推測で削除しない", () => {
  const plan = cleanup.planDraftCleanup(fixture());
  assert.deepEqual(plan.retainedLinked, [{ id: "a-linked", status: "approved", reason: "bufferPostId" }]);
});

test("dry-runは保存データを変更せず、before件数と対象ID一覧を返す（本文は含めない）", () => {
  const drafts = fixture();
  const snapshot = JSON.stringify(drafts);
  const plan = cleanup.planDraftCleanup(drafts);
  assert.equal(JSON.stringify(drafts), snapshot);
  assert.equal(plan.before.total, 8);
  assert.equal(plan.before.draft, 1); assert.equal(plan.before.queued, 1); assert.equal(plan.before.scheduled, 1); assert.equal(plan.before.published, 1);
  assert.equal(plan.before.withBufferPostId, 4);
  assert.equal(plan.after.total, 4);
  assert.deepEqual(plan.targets[0], { id: "d1", status: "draft" });
  assert.doesNotMatch(JSON.stringify(plan), /本文/);
});

test("2回連続実行すると2回目は対象0件（idempotent）", () => {
  const first = cleanup.planDraftCleanup(fixture());
  const after = cleanup.applyDraftCleanup(fixture(), first);
  const second = cleanup.planDraftCleanup(after);
  assert.equal(second.targets.length, 0);
  assert.deepEqual(cleanup.applyDraftCleanup(after, second), after);
  assert.notEqual(first.planId, second.planId, "下書きが変われば planId も変わる");
});
