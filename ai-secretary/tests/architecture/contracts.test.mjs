import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const read = (relative) => fs.readFileSync(path.join(ROOT, relative), "utf8");
const exists = (relative) => fs.existsSync(path.join(ROOT, relative));

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

test("kakei does not re-implement classification owned by the household app", () => {
  // 分類の正は家計簿アプリ側(merchant_rules / manual_category / needs_review)。
  // こちらに分類器や再分類APIを作ると、家計の正が2箇所に散る。
  for (const gone of [
    "app/lib/kakei/classify.ts",
    "app/lib/kakei/normalize.ts",
    "app/api/kakei/recategorize/route.ts",
  ]) {
    assert.ok(!exists(gone), `${gone} must not come back`);
  }
  const source = read("app/lib/kakei/source.ts");
  assert.match(source, /x-import-secret/);
  // Supabase直読みはRLS(auth.uid())上できない。家計簿DBの鍵を持ち出さない。
  // 説明コメントには出てよいので、import と env 参照だけを見る
  assert.doesNotMatch(source, /from ["']@supabase/);
  assert.doesNotMatch(source, /process\.env\.[A-Z_]*SUPABASE[A-Z_]*/);
  assert.doesNotMatch(read("package.json"), /@supabase\/supabase-js/);
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

  // 家計秘書が分類軸(budget-rules)と当月の集計を読めること
  assert.match(manifest, /memory\/personal\/finance\/budget-rules\.md/);
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

