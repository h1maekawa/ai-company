/**
 * Phase 6 のセキュリティ不変条件 — §55 / §56 / §68 / §69 / §82 / §83
 *
 * 実行権限を扱う層なので、「できないこと」をコードの中身で検査する。
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

const EXECUTION_FILES = filesUnder("app/lib/company/execution");

test("Phase 6 のファイルが存在する（テストが空振りしていない）", () => {
  assert.ok(EXECUTION_FILES.length >= 9, `${EXECUTION_FILES.length}件しかありません`);
});

/* ─── §68 Gatewayを迂回できない ─────────────────── */

test("【重要】外部Actionを直接実行するコードが無い", () => {
  for (const file of EXECUTION_FILES) {
    const source = read(file);
    // Gateway層は判断のみ。実際の送信・公開の呼び出しを持たない
    assert.doesNotMatch(source, /createPost\(|postToSlack\(|sendMail\(|fetch\(["']https/,
      `${file} が外部へ直接アクセスしています`);
  }
});

test("【重要】証券取引のExecutorが存在しない（§56）", () => {
  for (const file of EXECUTION_FILES) {
    assert.doesNotMatch(read(file), /placeOrder|submitOrder|executeTrade|sellPosition/i,
      `${file} に取引実行らしきコードがあります`);
  }
});

test("【重要】Fund Recommendationは人間のみが実行できる", () => {
  const engine = read("app/lib/fund/engine.ts");
  assert.match(engine, /executionAuthority:\s*"HUMAN_ONLY"/);
  assert.match(engine, /aiExecutionAllowed:\s*false/);

  const api = read("app/api/fund/evaluate/route.ts");
  assert.match(api, /executionAuthority:\s*"HUMAN_ONLY"/);
  assert.match(api, /aiExecutionAllowed:\s*false/);
});

test("【重要】GitHub書き込みのExecutorが存在しない（§55）", () => {
  for (const file of EXECUTION_FILES) {
    assert.doesNotMatch(read(file), /createPullRequest|createRef|child_process|execSync/,
      `${file} がGitを操作しています`);
  }
});

/* ─── リスク表の整合 ────────────────────────────── */

test("【重要】R4に危険なActionが揃っている", () => {
  const source = read("app/lib/company/execution/actionTypes.ts");
  for (const action of [
    "INVESTMENT_TRADE", "CREDENTIAL_CHANGE", "PROTECTED_CORE_MUTATION", "BULK_DELETE",
  ]) {
    assert.match(
      source,
      new RegExp(`${action}:\\s*"R4"`),
      `${action} が R4 になっていません`
    );
  }
});

test("【重要】外部影響のあるActionがR3以上になっている", () => {
  const source = read("app/lib/company/execution/actionTypes.ts");
  for (const action of ["GMAIL_SEND", "PUBLISH", "GITHUB_WRITE", "PAYMENT", "AD_SPEND"]) {
    assert.match(
      source,
      new RegExp(`${action}:\\s*"R[34]"`),
      `${action} が R3 未満です`
    );
  }
});

test("【重要】未登録のActionがR4として扱われる（Default Deny）", () => {
  const source = read("app/lib/company/execution/actionTypes.ts");
  assert.match(source, /ACTION_RISK\[actionType as ActionType\] \?\? "R4"/);
});

/* ─── §23 §24 権限の実行時強制 ──────────────────── */

test("【重要】Gatewayが権限チェックを行っている", () => {
  const source = read("app/lib/company/execution/actionGateway.ts");
  assert.match(source, /requiredPermissions\.filter/);
  assert.match(source, /status: "BLOCKED"/);
});

test("【重要】Phase 2 の permissions を出所としている（別定義を作らない）", () => {
  const source = read("app/lib/company/execution/actionGateway.ts");
  assert.match(source, /grantedPermissions/);
  assert.doesNotMatch(source, /^export function denyAllPermissions/m);
});

/* ─── §69 承認の不変条件 ────────────────────────── */

test("【重要】R4は承認後も実行できない実装になっている", () => {
  const source = read("app/lib/company/execution/actionGateway.ts");
  assert.match(source, /riskLevel === "R4"[\s\S]{0,200}executable: false/);
});

test("【重要】Missionは承認待ちがあると完了できない実装になっている", () => {
  const source = read("app/lib/company/execution/mission.ts");
  assert.match(source, /canComplete/);
  assert.match(source, /PENDING/);
});

test("【重要】却下でMissionをFAILEDにしていない（§28）", () => {
  const source = read("app/lib/company/execution/service.ts");
  assert.match(source, /REPLAN_REQUIRED/);
  assert.doesNotMatch(source, /REJECTED"[\s\S]{0,200}"FAILED"/);
});

/* ─── §33 外部内容の扱い ────────────────────────── */

test("【重要】外部文書由来のActionを塞ぐ実装がある", () => {
  const source = read("app/lib/company/execution/actionGateway.ts");
  assert.match(source, /external_content/);
  assert.match(source, /指示として解釈しません/);
});

/* ─── §66 XPをHealthに混ぜない ──────────────────── */

test("【重要】Company Health がXPを参照していない", () => {
  const source = read("app/lib/company/health.ts");
  assert.doesNotMatch(source, /computeCompanyXp|companyXp|XP/);
});

/* ─── §64 収益の二重計上防止 ────────────────────── */

test("【重要】貢献配分に重みの正規化がある", () => {
  const source = read("app/lib/company/execution/contribution.ts");
  assert.match(source, /const weight = 1 \/ unique\.length/);
});

/* ─── §82 既存機能を壊さない ────────────────────── */

test("【重要】既存AI社員・Secretaryエイリアスが残っている", () => {
  const departments = read("app/lib/config/departments.ts");
  assert.match(departments, /export type Secretary = EmployeeAgent/);
  for (const id of ["personal-fund", "personal-note", "personal-morning"]) {
    assert.ok(departments.includes(`id: "${id}"`), `${id} が消えています`);
  }
});

test("【重要】Phase 5 の Mission ステータスを壊していない", () => {
  const source = read("app/lib/company/missions.ts");
  for (const status of ["PLANNED", "ACTIVE", "COMPLETED", "open", "done"]) {
    assert.ok(source.includes(`"${status}"`), `${status} が消えています`);
  }
});

test("【重要】AI社員の状態はBackendで計算している（§39 UIで推測しない）", () => {
  const ui = read("components/company/WorldView.tsx");
  // UI側が Mission から状態を導出していないこと
  assert.doesNotMatch(ui, /status === "EXECUTING" \?|statusFromMission/);
  assert.match(ui, /AGENT_STATUS_LABELS/);
});
