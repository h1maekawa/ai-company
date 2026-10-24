import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";

const modulePath = path.join(process.env.QA_DIST, "out", "app", "lib", "company", "businessManager.js");
const { authorizeBusinessDelegation, MICRO_BUSINESS_REGISTRY } = await import(modulePath);
const NOW = new Date("2026-10-24T00:00:00.000Z");
const validRequest = (overrides = {}) => ({
  businessId: "SNS",
  actorAgentId: "personal-note",
  workerAgentId: "creator-content",
  actionType: "ANALYSIS",
  budgetYen: 0,
  executionCount: 1,
  deadline: "2026-10-24T12:00:00.000Z",
  delegationDepth: 0,
  ...overrides,
});

test("初期4事業を既存Agent IDに重ね、未配置事業は明示する", () => {
  assert.deepEqual(MICRO_BUSINESS_REGISTRY.map((business) => business.id), ["SNS", "INVEST", "CONTENT", "INCUBATION"]);
  assert.equal(MICRO_BUSINESS_REGISTRY.find((business) => business.id === "INCUBATION").status, "unassigned");
  assert.equal(MICRO_BUSINESS_REGISTRY.find((business) => business.id === "INVEST").dataContracts.revenue, "investment_pnl_not_revenue");
  assert.equal(authorizeBusinessDelegation(validRequest({ businessId: "INCUBATION" }), NOW).reason, "BUSINESS_MANAGER_UNASSIGNED");
});

test("登録Managerから許可Workerへの内部タスクを上限内で許可する", () => {
  assert.deepEqual(authorizeBusinessDelegation(validRequest(), NOW), {
    allowed: true,
    requiresHumanApproval: false,
    riskLevel: "R0",
    businessId: "SNS",
    managerAgentId: "personal-note",
    workerAgentId: "creator-content",
  });
});

test("事業Managerのなりすましと未登録Workerを拒否する", () => {
  assert.equal(authorizeBusinessDelegation(validRequest({ actorAgentId: "executive-assistant" }), NOW).reason, "MANAGER_NOT_AUTHORIZED");
  assert.equal(authorizeBusinessDelegation(validRequest({ workerAgentId: "personal-fund" }), NOW).reason, "WORKER_NOT_AUTHORIZED");
});

test("INVESTのManagerとWorkerも既存Fund Agent IDに限定する", () => {
  const decision = authorizeBusinessDelegation(validRequest({ businessId: "INVEST", actorAgentId: "personal-fund", workerAgentId: "fund-research" }), NOW);
  assert.equal(decision.allowed, true);
  assert.equal(authorizeBusinessDelegation(validRequest({ businessId: "INVEST", actorAgentId: "personal-note", workerAgentId: "fund-research" }), NOW).reason, "MANAGER_NOT_AUTHORIZED");
});

test("予算・実行回数・期限の上限超過を拒否する", () => {
  assert.equal(authorizeBusinessDelegation(validRequest({ budgetYen: 1 }), NOW).reason, "BUDGET_LIMIT_EXCEEDED");
  assert.equal(authorizeBusinessDelegation(validRequest({ executionCount: 4 }), NOW).reason, "EXECUTION_LIMIT_EXCEEDED");
  assert.equal(authorizeBusinessDelegation(validRequest({ deadline: "2026-10-25T00:00:01.000Z" }), NOW).reason, "DEADLINE_OUT_OF_BOUNDS");
});

test("Workerによる再委任とR4 Actionを拒否し、R3は既存承認へ送る", () => {
  assert.equal(authorizeBusinessDelegation(validRequest({ delegationDepth: 1 }), NOW).reason, "REDELEGATION_FORBIDDEN");
  assert.equal(authorizeBusinessDelegation(validRequest({ actionType: "INVESTMENT_TRADE" }), NOW).reason, "ACTION_PROHIBITED");
  assert.equal(authorizeBusinessDelegation(validRequest({ actionType: "PUBLISH" }), NOW).reason, "WORKER_PERMISSION_MISSING");
  const publishDraft = authorizeBusinessDelegation(validRequest({ actionType: "PUBLISH_DRAFT" }), NOW);
  assert.equal(publishDraft.allowed, true);
  assert.equal(publishDraft.requiresHumanApproval, true);
  assert.equal(publishDraft.riskLevel, "R2");
});
