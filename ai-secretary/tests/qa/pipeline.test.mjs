/**
 * 進行状況の集計（要件7）のテスト
 *
 * 滞留の判定はここに集約している。画面ごとに違う基準で「滞留」が出ると
 * 表示そのものが信用されなくなるため、閾値と境界を固定する。
 */

import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";

const OUT = path.join(process.env.QA_DIST, "out", "app", "lib", "review");
const pipeline = await import(path.join(OUT, "pipelineTypes.js"));

const NOW = new Date("2026-09-11T12:00:00Z");
const hoursAgo = (h) => new Date(NOW.getTime() - h * 3_600_000).toISOString();

const item = (over = {}) => ({
  id: "x_draft:d1",
  kind: "x_draft",
  sourceId: "d1",
  phase: "publish",
  title: "t",
  excerpt: "e",
  editable: true,
  reason: "承認待ち",
  updatedAt: hoursAgo(1),
  qa: null,
  ...over,
});

const task = (over = {}) => ({
  id: "at1",
  role: "writer",
  phase: "writing",
  instruction: "書いて",
  intent: "note",
  status: "queued",
  createdAt: hoursAgo(1),
  updatedAt: hoursAgo(1),
  ...over,
});

/* ─── 滞留の判定 ─────────────────────────────────── */

test("48時間を超えたら滞留", () => {
  assert.equal(pipeline.isStale(hoursAgo(49), NOW), true);
  assert.equal(pipeline.isStale(hoursAgo(47), NOW), false);
});

test("境界（ちょうど48時間）は滞留にしない", () => {
  assert.equal(pipeline.isStale(hoursAgo(48), NOW), false);
});

test("日付が無い・壊れている場合は滞留にしない（誤警告を出さない）", () => {
  assert.equal(pipeline.isStale("", NOW), false);
  assert.equal(pipeline.isStale(null, NOW), false);
  assert.equal(pipeline.isStale("not-a-date", NOW), false);
});

/* ─── 工程ごとの集計 ─────────────────────────────── */

test("4工程が必ず並ぶ（該当が無くても抜けない）", () => {
  const result = pipeline.buildPipeline([], [], NOW);
  assert.deepEqual(
    result.steps.map((s) => s.phase),
    ["research", "writing", "seo", "publish"]
  );
});

test("承認待ちとタスクを別の数字として数える（誰のボールか分けるため）", () => {
  const result = pipeline.buildPipeline(
    [item({ phase: "writing" })],
    [task({ phase: "writing" })],
    NOW
  );
  const writing = result.steps.find((s) => s.phase === "writing");
  assert.equal(writing.pending, 1);
  assert.equal(writing.tasks, 1);
});

test("完了・失敗・取消のタスクは進行中に数えない", () => {
  const result = pipeline.buildPipeline(
    [],
    [
      task({ id: "a", status: "done" }),
      task({ id: "b", status: "failed" }),
      task({ id: "c", status: "cancelled" }),
      task({ id: "d", status: "running" }),
    ],
    NOW
  );
  const writing = result.steps.find((s) => s.phase === "writing");
  assert.equal(writing.tasks, 1);
});

test("滞留は承認待ちとタスクの両方から数える", () => {
  const result = pipeline.buildPipeline(
    [item({ phase: "writing", updatedAt: hoursAgo(72) })],
    [task({ phase: "writing", updatedAt: hoursAgo(72) })],
    NOW
  );
  assert.equal(result.steps.find((s) => s.phase === "writing").stalled, 2);
  assert.equal(result.stalledTotal, 2);
});

test("自動テスト未通過の件数が工程ごとに出る", () => {
  const failing = { passed: false, checks: [], blockingFailures: 1, warnings: 0, skipped: 0 };
  const result = pipeline.buildPipeline(
    [item({ qa: failing }), item({ id: "x_draft:d2", qa: { ...failing, passed: true } })],
    [],
    NOW
  );
  assert.equal(result.steps.find((s) => s.phase === "publish").blocked, 1);
  assert.equal(result.blockedTotal, 1);
});

test("合計が各工程の和と一致する", () => {
  const result = pipeline.buildPipeline(
    [item({ phase: "research" }), item({ id: "x2", phase: "publish" })],
    [],
    NOW
  );
  const sum = result.steps.reduce((n, s) => n + s.pending, 0);
  assert.equal(result.pendingTotal, sum);
});
