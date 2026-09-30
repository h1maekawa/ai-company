import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";

function loadTs(path, mocks) {
  const source = fs.readFileSync(path, "utf8");
  const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const exports = {};
  vm.runInNewContext(js, { exports, require: (name) => {
    if (!(name in mocks)) throw new Error(`Unexpected import: ${name}`);
    return mocks[name];
  }, console, Date, crypto: globalThis.crypto });
  return exports;
}

test("Knowledge source survives index failure and a bounded retry converges without a Vault walk", async () => {
  const status = new Map();
  const writes = [];
  let fail = true;
  let walks = 0;
  const path = "memory/knowledge/content/item.md";
  const module = loadTs("app/lib/knowledge/indexSync.ts", {
    "node:crypto": await import("node:crypto"),
    "../persistence/vaultStore": { vaultDocumentStore: { getFile: async () => ({ content: "# Source of truth" }) } },
    "../persistence/supabase/knowledgeIndexRepository": { supabaseKnowledgeIndexRepository: {
      configured: () => true, upsert: async (records) => { if (fail) throw new Error("index down"); writes.push(...records); },
    } },
    "../persistence/supabase/syncStatusRepository": { syncStatusRepository: {
      knowledgePath: async (key) => status.get(key) ?? null,
      knowledgePending: async (limit) => [...status.values()].filter((row) => row.status === "warning").slice(0, limit),
      upsert: async (row) => status.set(row.service, row),
    } },
    "./indexRecord": { knowledgeIndexRecord: (p, content) => ({ path: p, summary: content }) },
    "./walk": { listMarkdownPathsRecursively: async () => { walks++; return [path]; } },
  });
  assert.equal(await module.indexKnowledgePathBestEffort(path), false);
  const failed = status.get(`knowledge_index:${path}`);
  assert.equal(failed.metadata.sourceSaved, true);
  assert.equal(failed.metadata.phase, "failed");
  fail = false;
  assert.deepEqual(JSON.parse(JSON.stringify(await module.retryPendingKnowledgeIndex(1))), { retried: 1, indexed: 1, unavailable: false });
  const synced = status.get(`knowledge_index:${path}`);
  assert.equal(synced.metadata.sourceVersion, synced.metadata.indexVersion);
  assert.equal(writes.length, 1);
  assert.equal(walks, 0);
});

test("Daily job lock rejects simultaneous tick and resumes from a persisted checkpoint", async () => {
  const values = new Map();
  const redis = {
    get: async (key) => values.get(key) ?? null,
    set: async (key, value, opts) => {
      if (opts?.nx && values.has(key)) return null;
      values.set(key, value); return "OK";
    },
    del: async (key) => values.delete(key),
    multi: () => {
      const commands = [];
      return {
        set(key, value) { commands.push([key, value]); return this; },
        async exec() { for (const [key, value] of commands) values.set(key, value); },
      };
    },
  };
  const module = loadTs("app/lib/note/research/dailyJob.ts", {
    "../../utils/redis": { getRedisClient: () => redis },
    "../tokyoDate": { tokyoDateKey: () => "2026-09-30" },
    "./run": {},
  });
  const id = module.dailyOperationId();
  let unblock;
  const first = module.withDailyJobLock(id, async () => {
    await module.saveDailyCheckpoint(module.checkpoint(id, "collected", { topCandidates: [] }));
    await new Promise((resolve) => { unblock = resolve; });
  });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(await module.withDailyJobLock(id, async () => "duplicate"), null);
  unblock(); await first;
  assert.equal((await module.loadDailyCheckpoint(id)).phase, "collected");
});
