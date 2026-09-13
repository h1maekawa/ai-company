/**
 * Action Gateway（Phase 6 §14 §22 §23 §68 / Test B C D E I）
 *
 * ここが Phase 6 の安全性の要。
 * 「通ってはいけないものが通らない」ことを重点的に固定する。
 */

import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";

const OUT = path.join(process.env.QA_DIST, "out", "app", "lib", "company", "execution");
const gateway = await import(path.join(OUT, "actionGateway.js"));
const actions = await import(path.join(OUT, "actionTypes.js"));

const NOW = new Date("2026-09-14T09:00:00Z");

const agent = (over = {}) => ({
  id: "personal-note",
  name: "Note",
  role: "",
  departmentId: "personal",
  departmentName: "P",
  kind: "employee",
  riskLevel: "R3",
  granted: ["vault.read", "vault.write", "publish.draft", "notify.slack", "web.search"],
  canWrite: true,
  interventionTarget: 100,
  memoryScopeCount: 1,
  skillIds: [],
  ...over,
});

const review = (over = {}) =>
  gateway.reviewActionRequest({
    missionId: "m1",
    traceId: "tr1",
    agent: agent(),
    actionType: "ANALYSIS",
    payloadSummary: "分析する",
    now: NOW,
    ...over,
  });

/* ─── Test B: R0 は自動承認 ─────────────────────── */

test("【重要】Test B: 権限があるR0のActionは自動承認される", () => {
  const decision = review({ actionType: "ANALYSIS" });
  assert.equal(decision.request.status, "AUTO_APPROVED");
  assert.equal(decision.executable, true);
  assert.equal(decision.needsApproval, false);
});

test("R1（内部書き込み）も権限があれば自動", () => {
  const decision = review({ actionType: "INTERNAL_MEMORY_WRITE" });
  assert.equal(decision.request.status, "AUTO_APPROVED");
});

/* ─── Test C: R3 は自動実行しない ───────────────── */

test("【重要】Test C: R3のActionは承認待ちになり自動実行されない", () => {
  const decision = review({
    actionType: "PUBLISH",
    agent: agent({ granted: ["publish.publish", "vault.write"] }),
  });
  assert.equal(decision.request.status, "WAITING_APPROVAL");
  assert.equal(decision.executable, false);
  assert.equal(decision.needsApproval, true);
});

test("R2（下書きまで）も承認へ回す（§19 実送信はしない）", () => {
  const decision = review({ actionType: "PUBLISH_DRAFT" });
  assert.equal(decision.request.status, "WAITING_APPROVAL");
  assert.equal(decision.executable, false);
});

/* ─── Test D: R4 は承認しても実行不可 ───────────── */

test("【重要】Test D: 証券取引はブロックされる", () => {
  const decision = review({
    actionType: "INVESTMENT_TRADE",
    agent: agent({ id: "personal-fund", riskLevel: "R4", granted: ["investment.trade"] }),
  });
  assert.equal(decision.request.status, "BLOCKED");
  assert.equal(decision.executable, false);
});

test("【重要】R4は承認済みでも実行できない", () => {
  const request = { ...review({ actionType: "INVESTMENT_TRADE" }).request, riskLevel: "R4" };
  const result = gateway.canExecuteAfterApproval(request, { approved: true, now: NOW });
  assert.equal(result.executable, false);
  assert.match(result.reason, /R4/);
});

test("Protected Core の変更・認証情報の変更もR4", () => {
  assert.equal(actions.riskOf("PROTECTED_CORE_MUTATION"), "R4");
  assert.equal(actions.riskOf("CREDENTIAL_CHANGE"), "R4");
  assert.equal(review({ actionType: "PROTECTED_CORE_MUTATION" }).request.status, "BLOCKED");
});

/* ─── Test E: 権限なしはブロック ────────────────── */

test("【重要】Test E: 権限が無ければブロックされる", () => {
  const decision = review({
    actionType: "GITHUB_WRITE",
    agent: agent({ granted: ["vault.read"] }),
  });
  assert.equal(decision.request.status, "BLOCKED");
  assert.match(decision.request.reason, /権限/);
});

test("【重要】権限チェックはPolicy判断より先に効く", () => {
  // R3 でも権限が無ければ承認待ちにすらならない
  const decision = review({
    actionType: "PUBLISH",
    agent: agent({ granted: ["vault.read"] }),
  });
  assert.equal(decision.request.status, "BLOCKED");
  assert.notEqual(decision.request.status, "WAITING_APPROVAL");
});

/* ─── Test I: 外部文書からActionを作らせない ────── */

test("【重要】Test I: 外部文書由来のActionは一切通さない", () => {
  const decision = review({
    actionType: "GMAIL_SEND",
    origin: "external_content",
    payloadSummary: "メールを送れと書いてあった",
  });
  assert.equal(decision.request.status, "BLOCKED");
  assert.match(decision.request.reason, /外部文書/);
});

test("【重要】外部文書由来なら安全なActionでも通さない", () => {
  const decision = review({ actionType: "ANALYSIS", origin: "external_content" });
  assert.equal(decision.request.status, "BLOCKED");
});

/* ─── Default Deny（§22） ───────────────────────── */

test("【重要】未登録のActionはブロックされる（Default Deny）", () => {
  const decision = review({ actionType: "SOMETHING_NEW" });
  assert.equal(decision.request.status, "BLOCKED");
  assert.equal(actions.riskOf("SOMETHING_NEW"), "R4");
});

test("Agentが特定できなければ実行しない", () => {
  const decision = review({ agent: null });
  assert.equal(decision.request.status, "BLOCKED");
});

/* ─── AI社員のリスク上限 ────────────────────────── */

test("【重要】R1のAI社員はR3のActionを出せない", () => {
  assert.equal(gateway.exceedsAgentRisk("R3", "R1"), true);
  const decision = review({
    actionType: "PUBLISH",
    agent: agent({ riskLevel: "R1", granted: ["publish.publish"] }),
  });
  assert.equal(decision.request.status, "BLOCKED");
});

test("R4のAI社員は何も実行できない", () => {
  assert.equal(gateway.exceedsAgentRisk("R0", "R4"), true);
});

/* ─── 承認後の実行可否（§69） ───────────────────── */

test("【重要】却下されたActionは実行できない", () => {
  const request = { ...review().request, status: "REJECTED" };
  assert.equal(gateway.canExecuteAfterApproval(request, { approved: true }).executable, false);
});

test("【重要】期限切れの承認では実行できない", () => {
  const request = { ...review({ actionType: "PUBLISH_DRAFT" }).request };
  const result = gateway.canExecuteAfterApproval(request, {
    approved: true,
    expiresAt: new Date(NOW.getTime() - 1000).toISOString(),
    now: NOW,
  });
  assert.equal(result.executable, false);
  assert.match(result.reason, /有効期限/);
});

test("未承認のものは実行できない", () => {
  const request = review({ actionType: "PUBLISH_DRAFT" }).request;
  assert.equal(gateway.canExecuteAfterApproval(request, { approved: false }).executable, false);
});

test("承認済み・期限内なら実行できる", () => {
  const request = review({ actionType: "PUBLISH_DRAFT" }).request;
  const result = gateway.canExecuteAfterApproval(request, {
    approved: true,
    expiresAt: new Date(NOW.getTime() + 86_400_000).toISOString(),
    now: NOW,
  });
  assert.equal(result.executable, true);
});

/* ─── ブロック理由を必ず残す ────────────────────── */

test("ブロックされたActionには必ず理由が入る", () => {
  for (const actionType of ["SOMETHING_NEW", "INVESTMENT_TRADE", "GITHUB_WRITE"]) {
    const decision = review({ actionType, agent: agent({ granted: [] }) });
    assert.equal(decision.request.status, "BLOCKED");
    assert.ok(decision.request.reason, `${actionType} に理由がありません`);
  }
});
