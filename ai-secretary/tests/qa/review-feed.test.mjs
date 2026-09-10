/**
 * 承認フィード（要件2）のテスト
 *
 * 重視しているのは「承認の一元化で安全弁が緩まないこと」。
 * 一覧に集約したことで、差し戻し理由の必須化や自動テストの必須条件が
 * 抜け落ちるとそのまま事故になる。
 */

import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";

const OUT = path.join(process.env.QA_DIST, "out", "app", "lib", "review");
const types = await import(path.join(OUT, "types.js"));
const adapters = await import(path.join(OUT, "adapters.js"));

/* ─── ID の往復 ──────────────────────────────────── */

test("reviewItemId と parseReviewItemId が往復する", () => {
  const id = types.reviewItemId("x_draft", "d1");
  assert.equal(id, "x_draft:d1");
  assert.deepEqual(types.parseReviewItemId(id), { kind: "x_draft", sourceId: "d1" });
});

test("元IDにコロンが含まれても壊れない", () => {
  const id = types.reviewItemId("note_article", "a:b:c");
  assert.deepEqual(types.parseReviewItemId(id), {
    kind: "note_article",
    sourceId: "a:b:c",
  });
});

test("未知の種別・不正な形式は null を返す", () => {
  assert.equal(types.parseReviewItemId("unknown:1"), null);
  assert.equal(types.parseReviewItemId("x_draft"), null);
  assert.equal(types.parseReviewItemId(":d1"), null);
  assert.equal(types.parseReviewItemId("x_draft:"), null);
});

/* ─── 種別と工程の対応 ───────────────────────────── */

test("すべての種別が工程に写像される（要件10のフェーズ別設定の前提）", () => {
  for (const kind of Object.keys(types.REVIEW_KIND_LABELS)) {
    const phase = types.phaseOf(kind);
    assert.ok(
      types.REVIEW_PHASE_ORDER.includes(phase),
      `${kind} の工程 ${phase} が未定義です`
    );
  }
});

test("リサーチ系はresearch、X投稿はpublish工程になる", () => {
  assert.equal(types.phaseOf("viewpoint"), "research");
  assert.equal(types.phaseOf("experience"), "research");
  assert.equal(types.phaseOf("learning"), "research");
  assert.equal(types.phaseOf("note_article"), "writing");
  assert.equal(types.phaseOf("x_draft"), "publish");
});

/* ─── レビュー対象の絞り込み ─────────────────────── */

const draft = (over) => ({
  id: "d1",
  text: "本文",
  status: "draft",
  urls: [],
  needsDisclosure: false,
  ...over,
});

test("公開済み・破棄済み・予約済みはレビュー対象外", () => {
  assert.equal(adapters.isPendingXDraft(draft({ status: "draft" })), true);
  assert.equal(adapters.isPendingXDraft(draft({ status: "approved" })), true);
  assert.equal(adapters.isPendingXDraft(draft({ status: "published" })), false);
  assert.equal(adapters.isPendingXDraft(draft({ status: "discarded" })), false);
  assert.equal(adapters.isPendingXDraft(draft({ status: "queued" })), false);
  assert.equal(adapters.isPendingXDraft(draft({ status: "scheduled" })), false);
});

test("安全チェックで落ちた下書きは理由がそのまま出る", () => {
  const reason = adapters.xDraftReason(draft({ failureReason: "機密情報らしき文字列" }));
  assert.match(reason, /機密情報/);
});

test("candidate のものだけがレビュー対象（status未設定はcandidate扱い）", () => {
  assert.equal(adapters.isCandidate({ status: "candidate" }), true);
  assert.equal(adapters.isCandidate({}), true);
  assert.equal(adapters.isCandidate({ status: "approved" }), false);
  assert.equal(adapters.isCandidate({ status: "rejected" }), false);
});

/* ─── ReviewItem への写像 ────────────────────────── */

test("X下書きは編集可能、リサーチ系は編集不可として出る", () => {
  const x = adapters.toReviewItem(draft({ text: "これは投稿本文です" }), null);
  assert.equal(x.editable, true);
  assert.equal(x.kind, "x_draft");

  const vp = adapters.viewpointToReviewItem({
    id: "v1",
    title: "視点",
    topic: "AI",
    opinion: "意見",
    reasons: [],
    uncertainties: [],
    sourceDraftIds: [],
    reusable: true,
    verifiedByUser: false,
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
  });
  assert.equal(vp.editable, false);
  assert.equal(vp.phase, "research");
});

test("本文が空でもタイトルが崩れない", () => {
  const item = adapters.toReviewItem(draft({ text: "" }), null);
  assert.equal(item.title, "（本文なし）");
});

test("QAレポートがそのまま載る（承認可否の判断材料）", () => {
  const qa = { passed: false, checks: [], blockingFailures: 1, warnings: 0, skipped: 0 };
  const item = adapters.toReviewItem(draft({}), qa);
  assert.equal(item.qa.passed, false);
});
