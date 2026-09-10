/**
 * チャット→エージェント振り分け（要件1）のテスト
 *
 * タスク生成は副作用（タスクログが増える）を伴うため、
 * 同じ指示が常に同じ役割へ流れることが前提になる。
 * 発火語の評価順が変わると既存の振り分けが壊れるので、契約として固定する。
 */

import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";

const OUT = path.join(process.env.QA_DIST, "out", "app", "lib", "agents");
const dispatch = await import(path.join(OUT, "dispatch.js"));
const types = await import(path.join(OUT, "types.js"));

/* ─── 役割の判定 ─────────────────────────────────── */

const CASES = [
  ["note記事を書いて", "writer"],
  ["下書きを作って", "writer"],
  ["この内容を記事にして", "writer"],
  ["A8案件を調べて", "market"],
  ["アフィリの単価を調べて", "market"],
  ["市況を調べて", "market"],
  ["今週のトレンドを集めて", "research"],
  ["ネタを探して", "research"],
  ["この数字の裏取りをして", "fact_check"],
  ["事実確認しておいて", "fact_check"],
  ["タイトルを最適化して", "seo"],
  ["SEOの見出しを直して", "seo"],
  ["これを投稿して", "publisher"],
  ["明日の朝に予約して", "publisher"],
];

for (const [message, expected] of CASES) {
  test(`振り分け: 「${message}」→ ${expected}`, () => {
    assert.equal(dispatch.detectRole(message), expected);
  });
}

/* ─── タスク化しないもの ─────────────────────────── */

test("相談・質問はタスク化しない（副作用を出さない）", () => {
  for (const message of [
    "これどう思う？",
    "なぜこの数字になるの",
    "PERとはどういう意味",
    "ちょっと相談したい",
  ]) {
    assert.equal(dispatch.detectRole(message), null, message);
  }
});

test("空文字・空白はタスク化しない", () => {
  assert.equal(dispatch.detectRole(""), null);
  assert.equal(dispatch.detectRole("   "), null);
});

/* ─── 評価順の固定 ───────────────────────────────── */

test("「調べて」は名詞でmarketとresearchを分ける", () => {
  assert.equal(dispatch.detectRole("A8の案件を調べて"), "market");
  assert.equal(dispatch.detectRole("読者の悩みを調べて"), "research");
});

test("投稿は他の語より優先される（影響が最大のため先に判定）", () => {
  // 「記事にして投稿して」は writer と publisher の両方に当たるが publisher を採る
  assert.equal(dispatch.detectRole("記事にして投稿して"), "publisher");
});

/* ─── タスクの生成 ───────────────────────────────── */

test("タスクにチャットの出所が残る（要件1のタスクログ）", () => {
  const result = dispatch.dispatchFromChat({
    message: "note記事を書いて",
    intent: "note/SNS自動化・記事作成",
    secretaryId: "personal-note",
  });
  assert.equal(result.dispatched, true);
  assert.equal(result.task.role, "writer");
  assert.equal(result.task.status, "queued");
  assert.equal(result.task.sourceChat.secretaryId, "personal-note");
  assert.match(result.task.sourceChat.message, /note記事/);
  assert.equal(result.task.intent, "note/SNS自動化・記事作成");
});

test("タスク化しない場合は理由が返る", () => {
  const result = dispatch.dispatchFromChat({
    message: "どう思う？",
    intent: "一般",
    secretaryId: "executive-assistant",
  });
  assert.equal(result.dispatched, false);
  assert.ok(result.reason);
});

/* ─── 役割と工程の対応（要件3・要件10と共有） ───── */

test("すべての役割が工程に写像される", () => {
  for (const role of Object.keys(types.AGENT_ROLE_LABELS)) {
    const phase = types.phaseOfRole(role);
    assert.ok(
      ["research", "writing", "seo", "publish"].includes(phase),
      `${role} → ${phase}`
    );
  }
});

test("投稿担当だけが人間承認を必須とする（要件3）", () => {
  assert.equal(types.requiresApprovalBeforeRun("publisher"), true);
  for (const role of ["market", "research", "fact_check", "writer", "seo"]) {
    assert.equal(types.requiresApprovalBeforeRun(role), false, role);
  }
});
