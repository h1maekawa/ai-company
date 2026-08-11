import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";

const DIST = process.env.CONTENT_DIST;
const noteStudio = await import(path.join(DIST, "content/note-studio/types.js"));

test("ArticleSession: 作成直後は必ずMATERIAL stage", () => {
  const session = noteStudio.createArticleSession({ title: "テスト記事" });
  assert.equal(session.stage, "MATERIAL");
  assert.deepEqual(session.messages, []);
});

test("ArticleSession stage: 前進のみ許可する", () => {
  assert.equal(noteStudio.canAdvanceTo("MATERIAL", "ANGLE"), true);
  assert.equal(noteStudio.canAdvanceTo("MATERIAL", "DRAFT"), true);
  assert.equal(noteStudio.canAdvanceTo("DRAFT", "MATERIAL"), false);
  assert.equal(noteStudio.canAdvanceTo("OUTLINE", "ANGLE"), false);
});

test("ArticleSession stage: REVIEW→DRAFTの差し戻しだけ例外的に許可する", () => {
  assert.equal(noteStudio.canAdvanceTo("REVIEW", "DRAFT"), true);
  assert.equal(noteStudio.canAdvanceTo("APPROVED", "DRAFT"), false);
});

test("appendMessage: Chat autosave（メッセージが履歴に積み上がる）", () => {
  const session = noteStudio.createArticleSession({ title: "t" });
  const next = noteStudio.appendMessage(session, "user", "こんにちは");
  assert.equal(next.messages.length, 1);
  assert.equal(next.messages[0].role, "user");
  assert.equal(next.messages[0].text, "こんにちは");
  assert.notEqual(next.updatedAt, session.updatedAt === next.updatedAt);
});

test("nextStage: 最終段(PUBLISHED)からはこれ以上進まない", () => {
  assert.equal(noteStudio.nextStage("PUBLISHED"), "PUBLISHED");
});
