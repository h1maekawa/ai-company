import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const read = (relative) => fs.readFileSync(path.join(ROOT, relative), "utf8");

test("retired creator secretary has no active code references", () => {
  const files = [
    "app/lib/config/departments.ts",
    "app/lib/config/scopes.ts",
    "app/lib/router/executive.ts",
  ];
  for (const file of files) {
    assert.doesNotMatch(read(file), /personal-piro|memory\/personal\/piro|Piro Creator OS/);
  }
  assert.match(read("app/piro/page.tsx"), /redirect\(["']\/note["']\)/);
});

test("normal Note and Fund scopes do not recursively load whole departments", () => {
  const scopes = read("app/lib/config/scopes.ts");
  assert.doesNotMatch(scopes, /"memory\/personal\/note\/"/);
  assert.doesNotMatch(scopes, /"memory\/personal\/fund\/"/);
  assert.doesNotMatch(scopes, /investment-log\/"/);
});

test("kakei scope reads the ledger by month token, never the whole directory", () => {
  const manifest = read("app/lib/memory/manifest.ts");
  const scopes = read("app/lib/config/scopes.ts");
  const loader = read("app/lib/memory/loader.ts");

  // 台帳は毎月増える。ディレクトリ走査も個別列挙もしない
  assert.doesNotMatch(manifest, /"memory\/personal\/kakei\/"/);
  assert.doesNotMatch(scopes, /"memory\/personal\/kakei\/"/);
  assert.doesNotMatch(manifest, /kakei\/\d{4}-\d{2}\.md/);
  for (const token of ["{month}", "{prevMonth}"]) {
    assert.ok(
      manifest.includes(`memory/personal/kakei/${token}.md`),
      `core.kakei should name the ledger with ${token}`
    );
  }
  // トークンを解決できるのは loader だけ
  assert.match(loader, /function expandMonthTokens/);
  assert.match(loader, /\{prevMonth\}/);

  // 家計秘書が分類軸(budget-rules)と手取り/固定費(profile)を読めること
  assert.match(manifest, /memory\/personal\/finance\/budget-rules\.md/);
  assert.match(manifest, /memory\/personal\/kakei\/profile\.md/);
  assert.match(scopes, /"personal-finance": \{[\s\S]*?MEMORY_MANIFEST\.core\.kakei/);
});

test("local Vault has no hard-coded personal default", () => {
  const paths = read("app/lib/runtime/paths.ts");
  assert.doesNotMatch(paths, /\/Users\//);
  assert.match(paths, /VAULT_ROOT is required/);
});

test("managed registry keeps Planning, Note and Fund path contracts", () => {
  const registry = read("app/lib/vault/managed-files.ts");
  assert.match(registry, /memory\/personal\/planning/);
  assert.match(registry, /memory\/personal\/note\/brand\.md/);
  assert.match(registry, /memory\/personal\/fund\/policy\.md/);
});

test("runtime ContextBus remains Redis-first and Vault legacy file is not referenced", () => {
  const bus = read("app/lib/context/bus-server.ts");
  assert.match(bus, /Redis \(source of truth\)/);
  assert.doesNotMatch(bus, /memory\/context\/current-bus\.md/);
});

