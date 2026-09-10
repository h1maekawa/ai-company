/**
 * Executive Router の回帰テスト — 要件9「回帰テスト」
 *
 * Routerの振り分けはキーワードの前方一致で決まるため、
 * 分岐を1つ足しただけで既存の振り分けが変わりうる（先に評価される分岐に食われる）。
 * 想定入出力を固定して、ロジック変更時のデグレを検知する。
 *
 * ここで検証するのはルールベース経路のみ。
 * AI判定へフォールバックする経路は非決定的なのでテスト対象にしない。
 */

import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";

const OUT = path.join(process.env.QA_DIST, "out", "app", "lib", "router");
const { routeRequest, isGrillingRequest } = await import(path.join(OUT, "executive.js"));

/** 入力 → 期待する秘書。ルールベースで決まりきるものだけを並べる */
const CASES = [
  ["note記事を書いて", "personal-note"],
  ["下書きを整えたい", "personal-note"],
  ["SNSの投稿案がほしい", "personal-note"],
  ["/note-draft", "personal-note"],
  ["NVDAの決算どうだった", "personal-fund"],
  ["ポートフォリオを見せて", "personal-fund"],
  ["この銘柄は買いか", "personal-fund"],
  ["/fund-review", "personal-fund"],
  ["今月の家計はどう", "personal-finance"],
  ["支出を減らしたい", "personal-finance"],
  ["予算を組み直す", "personal-finance"],
];

for (const [message, expected] of CASES) {
  test(`ルーティング: 「${message}」→ ${expected}`, async () => {
    const result = await routeRequest(message, "personal");
    assert.equal(result.secretary, expected);
    assert.ok(result.confidence >= 0.9, `confidence=${result.confidence}`);
    assert.ok(result.intent, "intentが空です");
  });
}

test("noteと投資のキーワードが両方入る場合、noteが優先される（評価順の固定）", async () => {
  // 現在の実装はnote分岐が先。順序を入れ替えると既存の振り分けが変わるため契約として固定する
  const result = await routeRequest("投資のnote記事を書きたい", "personal");
  assert.equal(result.secretary, "personal-note");
});

test("Grilling判定は独立して機能する", () => {
  assert.equal(typeof isGrillingRequest("設計を詰めたい"), "boolean");
});

test("RoutingResultの形が崩れていない（消費側の前提）", async () => {
  const result = await routeRequest("note記事を書いて", "personal");
  for (const key of ["intent", "department", "secretary", "confidence"]) {
    assert.ok(key in result, `${key} がありません`);
  }
  assert.equal(typeof result.confidence, "number");
});
