import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

process.env.VAULT_ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "ai-company-content-notestudio-"));

const DIST = process.env.CONTENT_DIST;
const noteStudioTypes = await import(path.join(DIST, "content/note-studio/types.js"));
const noteStudioStore = await import(path.join(DIST, "content/note-studio/store.js"));

test("NoteStorageProvider: 保存→読み込みでArticleSessionが往復する（Timebox Storageとは無関係）", async () => {
  const session = noteStudioTypes.createArticleSession({ title: "AI会社と記録の話" });
  const withMessage = noteStudioTypes.appendMessage(session, "user", "最近思っていること");

  await noteStudioStore.saveSession(withMessage);
  const loaded = await noteStudioStore.loadSession(withMessage.id);

  assert.ok(loaded);
  assert.equal(loaded.title, "AI会社と記録の話");
  assert.equal(loaded.stage, "MATERIAL");
  assert.equal(loaded.messages.length, 1);
});

test("Draft != Published: 新規セッションはPUBLISHED状態ではない", async () => {
  const session = noteStudioTypes.createArticleSession({ title: "t" });
  await noteStudioStore.saveSession(session);
  const loaded = await noteStudioStore.loadSession(session.id);
  assert.notEqual(loaded.stage, "PUBLISHED");
});

