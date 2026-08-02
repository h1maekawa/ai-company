import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";

const DIST = process.env.MAEMICHI_DIST;
const conversation = await import(path.join(DIST, "integrations/slack/conversation.js"));

test("メンションを除いて普通の会話を解釈する", () => {
  const intent = conversation.classifyConversation("<@U123> 半導体について調べて");
  assert.equal(intent.type, "research");
  assert.equal(intent.topic, "半導体");
});

test("最新記事を見せてはスマホ下書き表示になる", () => {
  assert.equal(conversation.classifyConversation("最新の記事全文を見せて").type, "draft");
});

test("下書き状況はキュー確認になる", () => {
  assert.equal(conversation.classifyConversation("下書き一覧を教えて").type, "queue");
});

test("会話だけの公開依頼は公開意図として分離する", () => {
  assert.equal(conversation.classifyConversation("このままnoteに投稿して").type, "publish");
});

test("分からない会話には使い方を返す", () => {
  assert.equal(conversation.classifyConversation("こんにちは").type, "help");
});
