/**
 * Phase 4 の契約 — §38 〜 §41 / §47
 *
 * 既存機能を壊さないこと、機微データを持ち出さないこと、
 * 投資が分析のみに留まることを、コードの中身で検査する。
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
    .flatMap((entry) =>
      entry.isDirectory()
        ? filesUnder(path.join(dir, entry.name))
        : entry.name.endsWith(".ts")
          ? [path.join(dir, entry.name)]
          : []
    );
}

const COMPANY_FILES = filesUnder("app/lib/company");

test("Phase 4 のファイルが存在する（テストが空振りしていない）", () => {
  for (const file of [
    "app/lib/company/personalCompany.ts",
    "app/lib/company/trace.ts",
    "app/lib/company/cost.ts",
    "app/lib/company/personalMetrics.ts",
    "app/lib/company/revenue.ts",
    "app/lib/company/health.ts",
    "app/lib/company/reviews/reviews.ts",
  ]) {
    assert.ok(fs.existsSync(path.join(ROOT, file)), `${file} がありません`);
  }
});

/* ─── §47 既存機能を壊さない ─────────────────────── */

test("【重要】既存AI社員のIDを改名していない（§21 §47）", () => {
  const departments = read("app/lib/config/departments.ts");
  for (const id of ["personal-fund", "personal-note", "personal-morning", "executive-assistant"]) {
    assert.ok(departments.includes(`id: "${id}"`), `${id} が見当たりません`);
  }
});

test("【重要】Secretary エイリアスが残っている（§47）", () => {
  assert.match(read("app/lib/config/departments.ts"), /export type Secretary = EmployeeAgent/);
});

test("【重要】traceId が必須引数になっていない（§6 既存呼び出しを壊さない）", () => {
  const recorder = read("app/lib/agents/recorder.ts");
  // context は optional であること
  assert.match(recorder, /context\?:\s*ExecutionContext/);
});

/* ─── §39 §40 機微データの扱い ───────────────────── */

test("【重要】イベントに金融の生データを入れる構造がない（§39）", () => {
  const events = read("app/lib/company/events.ts");
  for (const forbidden of ["statement", "transactions", "cardDetail", "accountNumber", "balanceList"]) {
    assert.equal(
      events.includes(forbidden),
      false,
      `イベント定義に ${forbidden} が含まれています`
    );
  }
});

test("【重要】company配下に認証情報を書き出すコードがない（§40）", () => {
  for (const file of COMPANY_FILES) {
    const source = read(file);
    assert.doesNotMatch(source, /process\.env\.[A-Z_]*(KEY|TOKEN|SECRET|PASSWORD)/,
      `${file} が認証情報を参照しています`);
  }
});

/* ─── §41 投資の安全性 ───────────────────────────── */

test("【重要】company配下に発注・売買のコードがない（§41）", () => {
  for (const file of COMPANY_FILES) {
    const source = read(file);
    assert.doesNotMatch(source, /placeOrder|submitOrder|executeTrade|sellPosition|buyStock/i,
      `${file} に取引実行らしきコードがあります`);
  }
});

/* ─── §22 ロジックとSchedulerの分離 ──────────────── */

test("【重要】Schedulerは薄い（判断ロジックを持たない）", () => {
  const route = read("app/api/cron/personal-company-review/route.ts");
  // レビュー関数を呼んで保存するだけ。集計や判定を持たない
  assert.doesNotMatch(route, /computeCompanyHealth|computeFireProgress|summarizeRevenue/);
  assert.match(route, /runDailyPersonalCompanyReview/);
});

/* ─── §42 §43 Core と Personal Config の分離 ─────── */

test("【重要】評価ロジックに個人固有の金額をベタ書きしていない（§42）", () => {
  const healthSource = read("app/lib/company/health.ts");
  // 収入・資産の満点基準は外から渡す設計になっていること
  assert.match(healthSource, /targets\?:/);
  assert.doesNotMatch(healthSource, /Maekawa|前川/);
});

test("Personal固有の値は personalCompany.ts に集約されている", () => {
  const profile = read("app/lib/company/personalCompany.ts");
  assert.match(profile, /Maekawa AI Company/);
  // 他のCoreファイルには社名が出てこない
  for (const file of COMPANY_FILES.filter((f) => !f.endsWith("personalCompany.ts"))) {
    assert.equal(read(file).includes("Maekawa AI Company"), false, `${file} に社名があります`);
  }
});
