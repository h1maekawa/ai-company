import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// このファイル専用の一時Vault（Timeboxのplanningデータは一切置かない＝Timebox完全OFFを再現）
process.env.VAULT_ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "ai-company-content-providers-"));

const DIST = process.env.CONTENT_DIST;
const timebox = await import(path.join(DIST, "content/core/providers/timebox.js"));
const manual = await import(path.join(DIST, "content/core/providers/manual.js"));
const registry = await import(path.join(DIST, "content/core/providers/registry.js"));

test("Timebox完全OFF: getCompletedTasksForDateは例外を投げず空を返す", async () => {
  const result = await timebox.getCompletedTasksForDate("2026-08-10");
  assert.deepEqual(result.tasks, []);
  assert.equal(result.date, null);
});

test("Timebox完全OFF: TimeboxContentProvider.isAvailable()はfalse（例外を投げない）", async () => {
  const available = await timebox.TimeboxContentProvider.isAvailable();
  assert.equal(available, false);
});

test("Timebox完全OFF: TimeboxContentProvider.listMaterials()は空配列（Note/Xを壊さない）", async () => {
  const materials = await timebox.TimeboxContentProvider.listMaterials();
  assert.deepEqual(materials, []);
});

test("Manual Provider: 常にisAvailable=true（Timeboxが無くても使える）", async () => {
  assert.equal(await manual.ManualContentProvider.isAvailable(), true);
});

test("Missing Provider fallback: 1つのProviderが使えなくても他のProvider集計は止まらない", async () => {
  const statuses = await registry.listProviderStatuses();
  const timeboxStatus = statuses.find((s) => s.id === "timebox");
  const manualStatus = statuses.find((s) => s.id === "manual");
  assert.equal(timeboxStatus.available, false);
  assert.equal(manualStatus.available, true);
  // 例外を投げず、全Providerぶんの結果が返ること
  assert.equal(statuses.length, 7);
});

test("Missing Provider fallback: listAllMaterialsは例外を投げず配列を返す", async () => {
  const materials = await registry.listAllMaterials();
  assert.ok(Array.isArray(materials));
});
