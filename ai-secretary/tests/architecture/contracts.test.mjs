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

