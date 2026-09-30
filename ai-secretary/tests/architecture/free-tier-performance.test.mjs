import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";

const read = (path) => fs.readFileSync(path, "utf8");
const load = (path, dependencies, env = {}, globals = {}) => {
  const js = ts.transpileModule(read(path), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(js, {
    module, exports: module.exports, process: { env }, Date, Promise, AbortSignal, AbortController, Buffer, TextDecoder, setTimeout, clearTimeout,
    fetch: dependencies.fetch, require: (name) => {
      if (!(name in dependencies)) throw new Error(`unexpected dependency: ${name}`);
      return dependencies[name];
    }, ...globals,
  }, { filename: path });
  return module.exports;
};

test("connection checks are single-flight, source-bound, and do not promote configured webhook", async () => {
  let vaultLists = 0;
  let indexCounts = 0;
  const mod = load("app/lib/system/health.ts", {
    "../persistence/vaultStore": { vaultDocumentStore: { listEntries: async () => { vaultLists++; return []; } } },
    "../persistence/supabase/knowledgeIndexRepository": { supabaseKnowledgeIndexRepository: { configured: () => true, count: async () => { indexCounts++; return 9; } } },
    "../persistence/supabase/syncStatusRepository": { syncStatusRepository: { configured: () => false } },
    "../utils/redis": { isRedisAvailable: false },
    "../note/publishing/buffer": { isBufferConfigured: () => false },
  }, { SLACK_WEBHOOK_URL: "https://example.invalid/webhook", LOCAL_RUNNER_TOKEN: "configured" });
  const [a, b] = await Promise.all([mod.checkAllConnections(), mod.checkAllConnections()]);
  assert.equal(a, b);
  assert.equal(vaultLists, 1);
  assert.equal(indexCounts, 1);
  assert.equal(a.find((x) => x.service === "vault").checkedBy, "source-directory");
  assert.equal(a.find((x) => x.service === "slack").status, "unknown");
  assert.equal(a.find((x) => x.service === "slack").configured, true);
  assert.equal(a.find((x) => x.service === "note_runner").status, "unknown");
  assert.equal(a.find((x) => x.service === "supabase").stale, true);
  assert.equal(a.find((x) => x.service === "supabase").status, "warning");
});

test("failed source probe stays unknown even when search index is readable", async () => {
  const mod = load("app/lib/system/health.ts", {
    "../persistence/vaultStore": { vaultDocumentStore: { listEntries: async () => { throw new Error("offline"); } } },
    "../persistence/supabase/knowledgeIndexRepository": { supabaseKnowledgeIndexRepository: { configured: () => true, count: async () => 9 } },
    "../persistence/supabase/syncStatusRepository": { syncStatusRepository: { configured: () => false } },
    "../utils/redis": { isRedisAvailable: false },
    "../note/publishing/buffer": { isBufferConfigured: () => false },
  });
  const result = await mod.checkAllConnections();
  assert.equal(result.find((x) => x.service === "vault").status, "unknown");
  assert.equal(result.find((x) => x.service === "supabase").status, "warning");
});

test("deadline yields unknown when source probe never settles", async () => {
  const mod = load("app/lib/system/health.ts", {
    "../persistence/vaultStore": { vaultDocumentStore: { listEntries: () => new Promise(() => {}) } },
    "../persistence/supabase/knowledgeIndexRepository": { supabaseKnowledgeIndexRepository: { configured: () => false } },
    "../persistence/supabase/syncStatusRepository": { syncStatusRepository: { configured: () => false } },
    "../utils/redis": { isRedisAvailable: false },
    "../note/publishing/buffer": { isBufferConfigured: () => false },
  }, {}, { setTimeout: (fn) => { queueMicrotask(fn); return 1; }, clearTimeout: () => {} });
  const result = await mod.checkAllConnections();
  assert.equal(result.find((x) => x.service === "vault").status, "unknown");
});

test("stored news status never calls AI or GitHub PUT on a cache miss", async () => {
  let ai = 0;
  let put = 0;
  const mod = load("app/lib/investing/news.ts", {
    "../ai/client": { callAI: async () => { ai++; return ""; } },
    "../vault": { getVaultFile: async () => ({ content: "" }), saveVaultFile: async () => { put++; } },
  });
  const status = await mod.loadStoredNewsStatus();
  assert.equal(status.available, false);
  assert.equal(ai, 0);
  assert.equal(put, 0);
});

test("Home summary reads execution state once and leaves unevidenced cards unknown", async () => {
  let reads = 0;
  const mod = load("app/api/company/home-summary/route.ts", {
    "next/server": { NextResponse: { json: (body, options) => ({ body, options }) } },
    "@/app/lib/company/execution/store": { loadExecutionState: async () => {
      reads++;
      return { approvals: [{ status: "PENDING" }], missions: [{ title: "Creator draft", status: "ACTIVE", routingContext: { requiredAgentId: "personal-note" } }] };
    } },
    "@/app/lib/company/execution/approval": { applyExpiry: (items) => items },
    "@/app/lib/config/navigation": { BUSINESS_DEPARTMENT_IDS: ["creator", "fund", "operations", "planning", "engineering"] },
  });
  const result = await mod.GET();
  assert.equal(reads, 1);
  assert.equal(result.body.approvals.pendingCount, 1);
  assert.equal(result.body.departments.find((card) => card.id === "creator").status, "active");
  assert.equal(result.body.departments.find((card) => card.id === "fund").status, "unknown");
});

test("status GET cannot call generating news path, and health cannot full-walk", () => {
  const status = read("app/api/note/automation/status/route.ts");
  const health = read("app/lib/system/health.ts");
  const fetcher = read("app/lib/note/research/fetcher.ts");
  assert.match(status, /loadStoredNewsStatus/);
  assert.doesNotMatch(status, /loadNews\(/);
  assert.doesNotMatch(health, /readVaultKnowledgeIndexRecords|listMarkdownPathsRecursively/);
  assert.match(fetcher, /createHash\("sha256"\)/);
  assert.match(fetcher, /MAX_RESPONSE_BYTES/);
  assert.match(fetcher, /MAX_MEMORY_ENTRIES/);
  assert.match(fetcher, /ex: Math\.ceil\(CACHE_TTL_MS/);
});

test("research cache hashes entire URL, limits response bytes, and sets Redis expiry", async () => {
  const keys = [];
  const writes = [];
  let fetched = 0;
  const mod = load("app/lib/note/research/fetcher.ts", {
    "node:crypto": { createHash: (await import("node:crypto")).createHash },
    "../../utils/redis": { redisSafeGet: async () => null, getRedisClient: () => ({ set: async (...args) => writes.push(args) }) },
    fetch: async () => {
      fetched++;
      return { ok: true, headers: { get: () => null }, body: new ReadableStream({ start(controller) { controller.enqueue(new TextEncoder().encode("hello")); controller.close(); } }) };
    },
  });
  const shared = "https://example.invalid/" + "a".repeat(140);
  await mod.fetchPage(shared + "one");
  await mod.fetchPage(shared + "two");
  keys.push(...writes.map((item) => item[0]));
  assert.equal(fetched, 2);
  assert.notEqual(keys[0], keys[1]);
  assert.equal(writes[0][2].ex, 6 * 60 * 60);

  const tooLarge = load("app/lib/note/research/fetcher.ts", {
    "node:crypto": { createHash: (await import("node:crypto")).createHash },
    "../../utils/redis": { redisSafeGet: async () => null, getRedisClient: () => null },
    fetch: async () => ({ ok: true, headers: { get: () => "400001" }, body: null }),
  });
  const result = await tooLarge.fetchPage("https://example.invalid/large");
  assert.equal(result.ok, false);
  assert.equal(result.error, "RESPONSE_TOO_LARGE");
});
