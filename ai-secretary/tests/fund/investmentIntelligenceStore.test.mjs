import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import Module from "node:module";
import ts from "typescript";

const sourcePath = path.resolve("app/lib/investing/intelligence/store.ts");
const file = { content: "", sha: undefined, exists: false };
let readFailure = false;
let writes = 0;
const vault = {
  getVaultFile: async () => {
    if (readFailure) throw new Error("vault unavailable");
    return { ...file };
  },
  saveVaultFile: async (_path, content) => {
    writes += 1;
    file.content = content;
    file.sha = "mock-sha";
    file.exists = true;
    return { sha: file.sha };
  },
};
const compiled = ts.transpileModule(fs.readFileSync(sourcePath, "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2021, esModuleInterop: true },
}).outputText;
const storeModule = new Module(sourcePath);
storeModule.filename = sourcePath;
storeModule.paths = Module._nodeModulePaths(path.dirname(sourcePath));
const originalLoad = Module._load;
Module._load = function (request, parent, isMain) {
  if (request === "@/app/lib/vault") return vault;
  return originalLoad.call(this, request, parent, isMain);
};
try { storeModule._compile(compiled, sourcePath); }
finally { Module._load = originalLoad; }
const { readIntelligenceToday, saveIntelligenceToday } = storeModule.exports;

test("IntelligenceToday differentiates a missing file from a Vault read failure", async () => {
  file.content = "";
  file.exists = false;
  assert.deepEqual(await readIntelligenceToday(), { status: "NOT_FOUND", data: null });
  readFailure = true;
  assert.deepEqual(await readIntelligenceToday(), { status: "UNAVAILABLE", data: null, reason: "READ_FAILED" });
  readFailure = false;
});

test("saved IntelligenceToday can be reloaded with its research bundle", async () => {
  const value = { asOf: "2026-10-20T10:00:00.000Z", research: { generatedAt: "2026-10-20T10:00:00.000Z", artifacts: [{ id: "a1" }] } };
  await saveIntelligenceToday(value);
  const result = await readIntelligenceToday();
  assert.equal(result.status, "AVAILABLE");
  assert.deepEqual(result.data, value);
});

test("IntelligenceToday save propagates a read failure without overwriting the saved artifact", async () => {
  const prior = file.content;
  const beforeWrites = writes;
  readFailure = true;
  await assert.rejects(saveIntelligenceToday({ asOf: "2026-10-21T10:00:00.000Z" }), /vault unavailable/);
  assert.equal(file.content, prior);
  assert.equal(writes, beforeWrites);
  readFailure = false;
});

test("invalid saved JSON is unavailable rather than an empty result", async () => {
  file.content = "{";
  file.exists = true;
  assert.deepEqual(await readIntelligenceToday(), { status: "UNAVAILABLE", data: null, reason: "INVALID_DATA" });
});
