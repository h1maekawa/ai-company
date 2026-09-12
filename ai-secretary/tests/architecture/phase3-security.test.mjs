/**
 * Phase 3 のセキュリティ不変条件 — v3.1 §25 / §26 / §27
 *
 * Phase 3 は観測と提案までで、実行はしない。
 * 「読み取り専用である」ことをコードの中身で検査する。
 * 型やコメントではなく、実際に危険な呼び出しが入っていないかを見る。
 */

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const EVOLUTION_DIR = path.join(ROOT, "app/lib/company/evolution");

function sourceFiles(dir) {
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .flatMap((entry) =>
      entry.isDirectory()
        ? sourceFiles(path.join(dir, entry.name))
        : entry.name.endsWith(".ts")
          ? [path.join(dir, entry.name)]
          : []
    );
}

const FILES = sourceFiles(EVOLUTION_DIR);
const read = (file) => fs.readFileSync(file, "utf8");
const rel = (file) => path.relative(ROOT, file);

test("Phase 3 のファイルが存在する（テストが空振りしていない）", () => {
  assert.ok(FILES.length >= 8, `${FILES.length}件しか見つかりません`);
});

/*
 * Vault は本番では GitHub backed なので、「書き込まない」では粗すぎる。
 * Phase 3 は解析結果の保存（§19 §20）が仕事なので保存自体は必要。
 * 禁止すべきは「コードを書き換えること」なので、書き込み先で線を引く。
 */
const ALLOWED_WRITE_PREFIXES = ["memory/patterns", "memory/organization-proposals"];

test("【重要】Phase 3 が書き込むのは解析結果の保存先だけ", () => {
  const storeFile = FILES.find((f) => f.endsWith("store.ts"));
  assert.ok(storeFile, "store.ts が見つかりません");

  const source = read(storeFile);
  // saveVaultFile の対象になりうるパス定数を拾う
  const paths = [...source.matchAll(/"(memory\/[^"]+)"/g)].map((m) => m[1]);
  assert.ok(paths.length > 0, "保存先のパス定数が見つかりません");

  for (const target of paths) {
    assert.ok(
      ALLOWED_WRITE_PREFIXES.some((prefix) => target.startsWith(prefix)),
      `許可されていない書き込み先です: ${target}`
    );
  }
});

test("【重要】Phase 3 はコードやワークフローを書き換えない", () => {
  for (const file of FILES) {
    const source = read(file);
    // リポジトリのコードへ書き込む手段を持っていないこと
    assert.doesNotMatch(source, /fs\.(write|append|unlink|rm)|child_process|execSync|createRef|createPullRequest/,
      `${rel(file)} がファイルシステム・Gitを直接操作しています`);
    assert.doesNotMatch(source, /["'](?:app|components|scripts|\.github)\//,
      `${rel(file)} がコードのパスを書き込み対象にしています`);
  }
});

test("【重要】Phase 3 は投稿・送信を行わない", () => {
  for (const file of FILES) {
    const source = read(file);
    assert.doesNotMatch(source, /createPost|postToSlack|sendMail|publish\(/,
      `${rel(file)} に送信処理があります`);
  }
});

test("【重要】Phase 3 は EmployeeAgent の権限を変更しない", () => {
  for (const file of FILES) {
    const source = read(file);
    assert.doesNotMatch(source, /\.permissions\s*=|saveResearchSettings|denyAllPermissions\(\)\s*=/,
      `${rel(file)} が権限を書き換えています`);
  }
});

test("【重要】Phase 3 は Protected Core に触れない（§26）", () => {
  const PROTECTED = [
    "authority-matrix",
    "security-policy",
    "forbidden-actions",
    "credential-system",
    "action-gateway",
    "approval-engine",
    "production-secret",
    "root-system-prompt",
  ];
  for (const file of FILES) {
    const source = read(file);
    for (const name of PROTECTED) {
      assert.equal(
        source.includes(name),
        false,
        `${rel(file)} が Protected Core (${name}) を参照しています`
      );
    }
  }
});

test("【重要】提案が自分で IMPLEMENTED / APPROVED になるコードがない", () => {
  for (const file of FILES) {
    const source = read(file);
    assert.doesNotMatch(source, /status:\s*"IMPLEMENTED"|status:\s*"APPROVED"/,
      `${rel(file)} が提案を自動で承認・実装済みにしています`);
  }
});

test("保存は store.ts に閉じている（他のファイルはVaultに触らない）", () => {
  // store.ts だけが保存を担当する。解析・提案生成は純粋に保つ
  for (const file of FILES.filter((f) => !f.endsWith("store.ts"))) {
    const source = read(file);
    assert.doesNotMatch(source, /getVaultFile|saveVaultFile/,
      `${rel(file)} が直接Vaultへアクセスしています`);
  }
});

test("Phase 1 のイベント定義を複製していない（Single Source of Truth）", () => {
  for (const file of FILES) {
    const source = read(file);
    assert.doesNotMatch(source, /^export type CompanyEvent = \{/m,
      `${rel(file)} がイベント定義を複製しています`);
  }
});

test("fixtures は本番コードから参照されていない", () => {
  const productionFiles = FILES.filter((f) => !f.endsWith("fixtures.ts"));
  for (const file of productionFiles) {
    assert.doesNotMatch(read(file), /from ["'].*fixtures["']/,
      `${rel(file)} が fixtures を参照しています`);
  }
});
