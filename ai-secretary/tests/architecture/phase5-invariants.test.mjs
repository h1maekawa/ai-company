/**
 * Phase 5 の不変条件 — §43 〜 §46 / §64 / §65
 *
 * 金銭を扱う層なので、「できないこと」をコードの中身で検査する。
 */

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");

function filesUnder(dir) {
  const full = path.join(ROOT, dir);
  if (!fs.existsSync(full)) return [];
  return fs
    .readdirSync(full, { withFileTypes: true })
    .flatMap((e) =>
      e.isDirectory()
        ? filesUnder(path.join(dir, e.name))
        : e.name.endsWith(".ts")
          ? [path.join(dir, e.name)]
          : []
    );
}

const OPPORTUNITY_FILES = filesUnder("app/lib/company/opportunity");
const REVENUE_FILES = [
  "app/lib/company/revenueStore.ts",
  "app/lib/company/revenue.ts",
  "app/lib/company/revenueMode.ts",
  "app/lib/company/financialSettings.ts",
];

test("Phase 5 のファイルが存在する（テストが空振りしていない）", () => {
  assert.ok(OPPORTUNITY_FILES.length >= 4, `${OPPORTUNITY_FILES.length}件しかありません`);
  for (const file of REVENUE_FILES) {
    assert.ok(fs.existsSync(path.join(ROOT, file)), `${file} がありません`);
  }
});

/* ─── §45 §46 Opportunity Engine は実行しない ────── */

test("【重要】Opportunity Engine は公開・送信・取引を行わない", () => {
  for (const file of OPPORTUNITY_FILES) {
    const source = read(file);
    assert.doesNotMatch(source, /createPost|postToSlack|sendMail|sendEmail|publishArticle/,
      `${file} に公開・送信処理があります`);
    assert.doesNotMatch(source, /placeOrder|submitOrder|executeTrade|charge|payment/i,
      `${file} に取引・決済らしき処理があります`);
  }
});

test("【重要】Opportunity Engine は GitHub へ書き込まない", () => {
  for (const file of OPPORTUNITY_FILES) {
    assert.doesNotMatch(read(file), /createPullRequest|createRef|child_process|execSync/,
      `${file} がGitを操作しています`);
  }
});

test("【重要】Opportunity Engine は認証情報を読まない（§44 default deny）", () => {
  for (const file of OPPORTUNITY_FILES) {
    assert.doesNotMatch(read(file), /process\.env\.[A-Z_]*(KEY|TOKEN|SECRET|PASSWORD|CREDENTIAL)/,
      `${file} が認証情報を参照しています`);
  }
});

/* ─── §43 金融の生データを保存しない ─────────────── */

test("【重要】収益の保存に口座情報のフィールドがない", () => {
  const source = read("app/lib/company/revenueStore.ts");
  for (const forbidden of [
    "accountNumber", "bankAccount", "cardNumber", "iban", "routingNumber", "branchCode",
  ]) {
    assert.equal(source.includes(forbidden), false, `${forbidden} が含まれています`);
  }
});

test("【重要】財務設定に認証情報を保存しない", () => {
  const source = read("app/lib/company/financialSettings.ts");
  assert.doesNotMatch(source, /password|apiKey|accessToken/i);
});

/* ─── §64 不変条件 ──────────────────────────────── */

test("【重要】未確認の収益がAI収益に入らない実装になっている", () => {
  const source = read("app/lib/company/revenue.ts");
  // isAiGeneratedRevenue が confirmedByHuman を必ず見ていること
  assert.match(source, /if \(!entry\.confirmedByHuman\) return false/);
});

test("【重要】投資収益がAI収益に入らない実装になっている", () => {
  const source = read("app/lib/company/revenue.ts");
  assert.match(source, /if \(isInvestmentRevenue\(entry\)\) return false/);
});

test("【重要】収益履歴を上書きする実装がない（Append Only・§8）", () => {
  const source = read("app/lib/company/revenueStore.ts");
  // 追記のみ。既存配列の要素を書き換えるコードを置かない
  assert.match(source, /const next = \[\.\.\.entries, entry\]/);
  assert.doesNotMatch(source, /entries\[\w+\]\s*=/);
});

test("【重要】Phase 5 は EmployeeAgent の権限を変更しない", () => {
  for (const file of [...OPPORTUNITY_FILES, ...REVENUE_FILES]) {
    assert.doesNotMatch(read(file), /\.permissions\s*=|denyAllPermissions\(\)\s*=/,
      `${file} が権限を書き換えています`);
  }
});

/* ─── §65 既存機能を壊さない ─────────────────────── */

test("【重要】Mission の既存ステータスを残している（Additive）", () => {
  const source = read("app/lib/company/missions.ts");
  for (const status of ["open", "in_progress", "done", "skipped"]) {
    assert.ok(source.includes(`"${status}"`), `既存ステータス ${status} が消えています`);
  }
  // Phase 5 で追加したものも存在する
  for (const status of ["PLANNED", "ACTIVE", "COMPLETED"]) {
    assert.ok(source.includes(`"${status}"`), `${status} がありません`);
  }
});

test("【重要】Proposal の personalImpact は Optional（Phase 3 契約を壊さない）", () => {
  const source = read("app/lib/company/evolution/proposalTypes.ts");
  assert.match(source, /personalImpact\?:/);
});

test("【重要】Phase 4 の Achievement ロジックを再実装していない（§12）", () => {
  // 収益APIは既存の evaluateAchievements を使うこと
  const source = read("app/api/company/revenue/route.ts");
  assert.match(source, /evaluateAchievements/);
  assert.doesNotMatch(source, /unlocked:\s*true/);
});

test("【重要】RevenueAttribution 型を複製していない（§3 SSOT）", () => {
  const source = read("app/lib/company/revenueStore.ts");
  // Phase 4 の型を import して拡張していること
  assert.match(source, /RevenueAttribution/);
  assert.doesNotMatch(source, /^export type RevenueAttribution = \{/m);
});
