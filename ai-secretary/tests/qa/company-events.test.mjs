/**
 * 会社の活動イベントと指標（v3.1 §13 / §25）のテスト
 *
 * ここが狂うと、この上に載る Pattern Analyzer も Proposal Score も全部狂う。
 * 特に2点を固定する。
 *   1. signature の正規化（反復検出の精度がこれで決まる）
 *   2. CEO介入率の定義（承認を介入に数えない）
 */

import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";

const OUT = path.join(process.env.QA_DIST, "out", "app", "lib", "company");
const events = await import(path.join(OUT, "events.js"));
const metrics = await import(path.join(OUT, "metrics.js"));

const NOW = new Date("2026-09-12T12:00:00Z");
const daysAgo = (d) => new Date(NOW.getTime() - d * 86_400_000).toISOString();

const ev = (over = {}) => ({
  id: "e1",
  at: daysAgo(1),
  kind: "pipeline.step",
  department: "note",
  actor: "writer",
  action: "投稿案の生成",
  outcome: "success",
  signature: "sig",
  humanIntervention: false,
  ...over,
});

/* ─── signature の正規化（反復検出の土台） ───────── */

test("日付が違っても同じ仕事は同じsignatureになる", () => {
  const a = events.normalizeSignature("note記事を書いて（2026-09-12）");
  const b = events.normalizeSignature("note記事を書いて（2026-09-13）");
  assert.equal(a, b);
});

test("数値の違いを吸収する", () => {
  assert.equal(
    events.normalizeSignature("HP修正を3件"),
    events.normalizeSignature("HP修正を12件")
  );
});

test("括弧・記号・空白の揺れを吸収する", () => {
  assert.equal(
    events.normalizeSignature("「SEO修正」・Cloudflare Deploy"),
    events.normalizeSignature("SEO修正  Cloudflare   Deploy")
  );
});

test("別の仕事は別のsignatureになる（混ぜない）", () => {
  assert.notEqual(
    events.normalizeSignature("note記事を書いて"),
    events.normalizeSignature("A8案件を調べて")
  );
});

test("signatureを省略するとactorとactionから作られる", () => {
  const created = events.createCompanyEvent({
    kind: "chat.request",
    department: "note",
    actor: "personal-note",
    action: "記事を書いて",
    outcome: "success",
  });
  assert.ok(created.signature.length > 0);
  assert.equal(created.humanIntervention, false);
});

/* ─── CEO介入率（§13） ───────────────────────────── */

test("【重要】承認は介入に数えない（承認は関門であって手戻りではない）", () => {
  const result = metrics.computeMetrics(
    [
      ev({ id: "a", kind: "review.decision", action: "approve", humanIntervention: false }),
      ev({ id: "b", kind: "review.decision", action: "approve", humanIntervention: false }),
    ],
    14,
    NOW
  );
  assert.equal(result.ceoInterventionRate, 0);
  assert.equal(result.automationRate, 100);
});

test("差し戻し・編集して承認は介入に数える", () => {
  const result = metrics.computeMetrics(
    [
      ev({ id: "a", humanIntervention: true }),
      ev({ id: "b", humanIntervention: false }),
      ev({ id: "c", humanIntervention: false }),
      ev({ id: "d", humanIntervention: false }),
    ],
    14,
    NOW
  );
  assert.equal(result.ceoInterventionRate, 25);
  assert.equal(result.automationRate, 75);
});

test("イベントが0件でも壊れない（0除算しない）", () => {
  const result = metrics.computeMetrics([], 14, NOW);
  assert.equal(result.ceoInterventionRate, 0);
  assert.equal(result.totalEvents, 0);
  assert.equal(result.avgLatencyMs, null);
});

/* ─── 測れないものを0で埋めない ──────────────────── */

test("【重要】処理時間が無いイベントは平均に含めない", () => {
  // 0で埋めると「速くなった」と誤検出され、Time Saving の配点が狂う
  const result = metrics.computeMetrics(
    [ev({ id: "a", latencyMs: 1000 }), ev({ id: "b" })],
    14,
    NOW
  );
  assert.equal(result.avgLatencyMs, 1000);
});

test("コストが1件も無ければ null（0円ではない）", () => {
  const result = metrics.computeMetrics([ev()], 14, NOW);
  assert.equal(result.totalCostUsd, null);
});

test("コストは合算される", () => {
  const result = metrics.computeMetrics(
    [ev({ id: "a", costUsd: 0.12 }), ev({ id: "b", costUsd: 0.03 })],
    14,
    NOW
  );
  assert.equal(result.totalCostUsd, 0.15);
});

/* ─── 集計の窓 ───────────────────────────────────── */

test("窓の外のイベントは数えない", () => {
  const result = metrics.computeMetrics(
    [ev({ id: "a", at: daysAgo(3) }), ev({ id: "b", at: daysAgo(30) })],
    14,
    NOW
  );
  assert.equal(result.totalEvents, 1);
});

test("部門別の内訳が件数降順で出る", () => {
  const result = metrics.computeMetrics(
    [
      ev({ id: "a", department: "note" }),
      ev({ id: "b", department: "note" }),
      ev({ id: "c", department: "fund" }),
    ],
    14,
    NOW
  );
  assert.equal(result.byDepartment[0].department, "note");
  assert.equal(result.byDepartment[0].events, 2);
});
