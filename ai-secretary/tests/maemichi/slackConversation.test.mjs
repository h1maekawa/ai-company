import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";

const DIST = process.env.MAEMICHI_DIST;
const conversation = await import(path.join(DIST, "integrations/slack/conversation.js"));

test("メンションを除いて普通の会話を解釈する", () => {
  const intent = conversation.classifyConversation("<@U123> 半導体について調べて");
  assert.equal(intent.type, "research");
  assert.equal(intent.topic, "半導体");
  assert.equal(intent.destination, "both");
});

test("note記事用とX投稿用のリサーチを会話から分けられる", () => {
  const note = conversation.classifyConversation("note記事用に半導体について調べて");
  assert.equal(note.type, "research");
  assert.equal(note.destination, "note");
  assert.equal(note.topic, "半導体");

  const x = conversation.classifyConversation("X投稿向けにAIニュースを調べて");
  assert.equal(x.type, "research");
  assert.equal(x.destination, "x");
  assert.equal(x.topic, "AIニュース");
});

test("自然な依頼文から余計な語を除いて半導体だけを抽出する", () => {
  const intent = conversation.classifyConversation(
    "<@U123> Xに記載する半導体関連について調べてほしい。"
  );
  assert.equal(intent.type, "research");
  assert.equal(intent.destination, "x");
  assert.equal(intent.topic, "半導体");
});

test("短い追加発言をリサーチとして理解する", () => {
  const gpu = conversation.classifyConversation("<@U123> GPUについて");
  assert.equal(gpu.type, "research");
  assert.equal(gpu.topic, "GPU");

  assert.equal(
    conversation.followUpResearchTopic("そもそもこの流れの中でどこに一番需要がありそうか？", "半導体"),
    "半導体 需要"
  );
});

test("最新記事を見せてはスマホ下書き表示になる", () => {
  assert.equal(conversation.classifyConversation("最新の記事全文を見せて").type, "draft");
});

test("下書き状況はキュー確認になる", () => {
  assert.equal(conversation.classifyConversation("下書き一覧を教えて").type, "queue");
});

test("会話からX投稿案を作成できる", () => {
  const intent = conversation.classifyConversation("半導体でX投稿案を作って");
  assert.deepEqual(intent, {
    type: "generate",
    kind: "x",
    articleType: "free",
    topic: "半導体",
    candidateNumber: undefined,
  });
});

test("候補番号とnote種別を会話から読み取る", () => {
  const intent = conversation.classifyConversation("2番目の候補で有料noteを書いて");
  assert.deepEqual(intent, {
    type: "generate",
    kind: "note",
    articleType: "paid",
    topic: undefined,
    candidateNumber: 2,
  });
});

test("候補を選んで意見入力へ進める", () => {
  assert.deepEqual(conversation.classifyConversation("1番目が気になる"), {
    type: "select",
    candidateNumber: 1,
  });
});

test("この意見で作っては検索テーマとして扱わない", () => {
  const intent = conversation.classifyConversation("この意見でXとnoteを両方作って");
  assert.equal(intent.type, "generate");
  assert.equal(intent.kind, "both");
  assert.equal(intent.topic, undefined);
});

test("Xとnoteの両方を会話から作成できる", () => {
  const intent = conversation.classifyConversation("一番上の候補でXとnoteを両方作って");
  assert.equal(intent.type, "generate");
  assert.equal(intent.kind, "both");
  assert.equal(intent.candidateNumber, 1);
});

test("会話だけの公開依頼は公開意図として分離する", () => {
  assert.equal(conversation.classifyConversation("このままnoteに投稿して").type, "publish");
});

test("分からない会話には使い方を返す", () => {
  assert.equal(conversation.classifyConversation("こんにちは").type, "help");
});
