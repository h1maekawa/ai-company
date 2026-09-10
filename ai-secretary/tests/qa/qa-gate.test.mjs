/**
 * QAゲート（要件9）のテスト
 *
 * 重視しているのは「通ってはいけないものが通らないこと」。
 * 自動承認（要件10）がこの passed を信頼して人間をスキップするため、
 * 偽の通過（false pass）はそのまま事故になる。
 */

import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";

const OUT = path.join(process.env.QA_DIST, "out", "app", "lib", "qa");
const { buildReport, check, skippedCheck } = await import(path.join(OUT, "types.js"));
const content = await import(path.join(OUT, "contentChecks.js"));
const facts = await import(path.join(OUT, "factChecks.js"));

/* ─── レポートの畳み込み ─────────────────────────── */

test("blockingが1つでも落ちたら passed=false になる", () => {
  const report = buildReport("t1", "x_draft", [
    check("a", "A", "blocking", null),
    check("b", "B", "blocking", "落ちた"),
    check("c", "C", "warning", "警告"),
  ]);
  assert.equal(report.passed, false);
  assert.equal(report.blockingFailures, 1);
  assert.equal(report.warnings, 1);
});

test("warningだけなら passed=true（承認は止めない）", () => {
  const report = buildReport("t2", "x_draft", [
    check("a", "A", "blocking", null),
    check("c", "C", "warning", "警告"),
  ]);
  assert.equal(report.passed, true);
  assert.equal(report.warnings, 1);
});

test("skippedはpassとして数えず、skipped件数に出る（黙って通さない）", () => {
  const report = buildReport("t3", "x_draft", [
    skippedCheck("a", "A", "blocking", "データ不足"),
  ]);
  assert.equal(report.skipped, 1);
  // skippedはfailではないのでpassed自体はtrueだが、件数が残るのでUIで気づける
  assert.equal(report.blockingFailures, 0);
});

/* ─── 文字崩れの検出 ─────────────────────────────── */

test("句読点の連続を検出する", () => {
  assert.deepEqual(content.findRepeatedPunctuation("これは。。おかしい"), ["。。"]);
  assert.deepEqual(content.findRepeatedPunctuation("正常な文章です。"), []);
});

test("閉じていない括弧を検出する", () => {
  assert.equal(content.findUnbalancedBrackets("「開いたまま").length, 1);
  assert.equal(content.findUnbalancedBrackets("「閉じている」").length, 0);
  assert.equal(content.findUnbalancedBrackets('引用が"奇数個').length, 1);
});

test("同じ行の繰り返しを検出する（生成ループの痕跡）", () => {
  const text = "これは十分に長い行です\n別の行\nこれは十分に長い行です";
  assert.equal(content.findDuplicateLines(text).length, 1);
  // 短い行の一致は偶然が多いので拾わない
  assert.equal(content.findDuplicateLines("ok\nng\nok").length, 0);
});

test("助詞で終わる中途切れを検出する", () => {
  assert.equal(content.looksTruncated("これは途中で切れて"), true);
  assert.equal(content.looksTruncated("これは完結している。"), false);
});

/* ─── X投稿の検査 ────────────────────────────────── */

const baseDraft = {
  id: "d1",
  xAccountId: "acc1",
  purpose: "grow",
  genreId: "ai",
  text: "今日は市場が動いた。理由はまだ整理しきれていないが、記録だけ残しておく。",
  urls: [],
  needsDisclosure: false,
  status: "draft",
};

const byId = (checks, id) => checks.find((c) => c.id === id);

test("正常なX下書きはblockingが落ちない", () => {
  const checks = content.checkXDraft(baseDraft);
  assert.deepEqual(
    checks.filter((c) => c.severity === "blocking" && c.status === "fail"),
    []
  );
});

test("本文が空ならblockingで落ちる", () => {
  const checks = content.checkXDraft({ ...baseDraft, text: "   " });
  assert.equal(byId(checks, "x.body.present").status, "fail");
});

test("文字数上限超過はblockingで落ちる", () => {
  const checks = content.checkXDraft({ ...baseDraft, text: "あ".repeat(300) });
  assert.equal(byId(checks, "x.length.max").status, "fail");
});

test("必須項目が欠けたらblockingで落ちる", () => {
  const checks = content.checkXDraft({ ...baseDraft, xAccountId: "", genreId: "" });
  const required = byId(checks, "x.required");
  assert.equal(required.status, "fail");
  assert.match(required.detail, /xAccountId/);
  assert.match(required.detail, /genreId/);
});

test("アフィリエイトがあるのに開示していなければ落ちる", () => {
  const checks = content.checkXDraft({
    ...baseDraft,
    affiliateId: "a8-123",
    needsDisclosure: false,
  });
  assert.equal(byId(checks, "x.disclosure").status, "fail");
});

/* ─── note記事の検査 ─────────────────────────────── */

const baseArticle = {
  id: "n1",
  title: "投資判断を記録に残す理由について",
  articleType: "essay",
  freeSection: "あ".repeat(500),
  tags: ["投資"],
  affiliateIds: [],
  needsDisclosure: false,
  sourceResearchItemIds: ["r1"],
  sourceExperienceIds: [],
  status: "draft",
};

test("正常なnote記事はblockingが落ちない", () => {
  const checks = content.checkNoteArticle(baseArticle);
  assert.deepEqual(
    checks.filter((c) => c.severity === "blocking" && c.status === "fail"),
    []
  );
});

test("無料部分が短すぎればblockingで落ちる", () => {
  const checks = content.checkNoteArticle({ ...baseArticle, freeSection: "短い" });
  assert.equal(byId(checks, "note.free.length").status, "fail");
});

test("有料部分があるのに境界が未設定ならblockingで落ちる", () => {
  const checks = content.checkNoteArticle({
    ...baseArticle,
    paidSection: "有料の中身",
  });
  assert.equal(byId(checks, "note.paywall.boundary").status, "fail");
});

test("出典が1つも無ければskippedになる（passにしない）", () => {
  const checks = content.checkNoteArticle({
    ...baseArticle,
    sourceResearchItemIds: [],
    sourceExperienceIds: [],
  });
  assert.equal(byId(checks, "note.sources").status, "skipped");
});

/* ─── ファクトチェック ───────────────────────────── */

test("数値と単位を抜き出す", () => {
  const nums = facts.extractNumbers("株価は1,200円で、前日比は12.5%上昇した");
  assert.equal(nums.find((n) => n.value === 1200).unit, "円");
  assert.equal(nums.find((n) => n.value === 12.5).unit, "%");
});

test("参照元にある数値は通過する", () => {
  const result = facts.checkNumbersAgainstSources({
    text: "前日比は12.5%上昇した",
    sources: ["終値ベースで12.5%の上昇となった"],
  });
  assert.equal(result.status, "pass");
});

test("参照元に無い数値はblockingで落ちる（AIが作った数字を止める）", () => {
  const result = facts.checkNumbersAgainstSources({
    text: "前日比は12.5%上昇した",
    sources: ["終値ベースで3.2%の上昇となった"],
  });
  assert.equal(result.status, "fail");
  assert.match(result.detail, /12\.5/);
});

test("参照元が無い場合はpassではなくskippedになる", () => {
  const result = facts.checkNumbersAgainstSources({
    text: "前日比は12.5%上昇した",
    sources: [],
  });
  assert.equal(result.status, "skipped");
});

test("年号と1桁の数は突合対象にしない（誤検知が実害を上回る）", () => {
  const result = facts.checkNumbersAgainstSources({
    text: "2026年の話で、理由は3つある",
    sources: ["参照元テキスト"],
  });
  assert.equal(result.status, "pass");
});

test("断定的な将来予測はblockingで落ちる", () => {
  assert.equal(facts.checkForwardLookingClaims("これは必ず上がる").status, "fail");
  assert.equal(facts.checkForwardLookingClaims("元本保証です").status, "fail");
  assert.equal(
    facts.checkForwardLookingClaims("上がるかもしれないが分からない").status,
    "pass"
  );
});
