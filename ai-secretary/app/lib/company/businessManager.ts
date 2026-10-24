/**
 * Micro Business OS の最小Business Manager / 委任契約。
 *
 * Business IDはこのレイヤーのルーティング用であり、社員の正本は
 * DEPARTMENTS、実行・承認の正本は既存のMission / Action Gatewayを使う。
 * actorAgentIdは認証済みの実行コンテキストからサーバー側で渡すこと。
 * モデルやリクエスト本文の自己申告値をそのまま渡してはならない。
 */

import { DEPARTMENTS } from "../config/departments";
import { ACTION_RISK, permissionsFor, type ActionType } from "./execution/actionTypes";
import { grantedPermissions, type RiskLevel } from "./agentTypes";

export type MicroBusinessId = "SNS" | "INVEST" | "CONTENT" | "INCUBATION";

export type MicroBusinessManagerContract = {
  id: MicroBusinessId;
  status: "ready" | "unassigned";
  /** DEPARTMENTS上の既存Agent ID。事業部専用の社員台帳は作らない。 */
  managerAgentId: string | null;
  /** Managerが直接委任できる既存Agent ID。Workerの再委任は許可しない。 */
  workerAgentIds: readonly string[];
  limits: {
    maxBudgetYenPerTask: number;
    /** 直近24時間に作成した委任Missionの予算予約合計上限。 */
    maxBudgetYenPer24Hours: number;
    /** 同一事業で作成できるMission数。maxExecutionsPerTaskとは別の連続実行上限。 */
    maxMissionsPer24Hours: number;
    maxExecutionsPerTask: number;
    maxDurationHours: number;
    maxDelegationDepth: 0;
  };
  /** 参照する既存データ契約。新しいKPI/会計Storeは作らない。 */
  dataContracts: {
    kpi: "existing_performance_projection";
    revenue: "revenue_ledger" | "investment_pnl_not_revenue";
    cost: "business_cost_ledger";
  };
};

export const MICRO_BUSINESS_REGISTRY: readonly MicroBusinessManagerContract[] = [
  {
    id: "SNS",
    status: "ready",
    managerAgentId: "personal-note",
    workerAgentIds: ["creator-research", "creator-content", "creator-kpi"],
    limits: { maxBudgetYenPerTask: 0, maxBudgetYenPer24Hours: 0, maxMissionsPer24Hours: 6, maxExecutionsPerTask: 3, maxDurationHours: 24, maxDelegationDepth: 0 },
    dataContracts: { kpi: "existing_performance_projection", revenue: "revenue_ledger", cost: "business_cost_ledger" },
  },
  {
    id: "INVEST",
    status: "ready",
    // 既存のFund Manager AIを事業契約上のManagerとして割り当てる。
    // Agent IDやEmployeeAgent.kindは変更しない。
    managerAgentId: "personal-fund",
    workerAgentIds: ["fund-research"],
    limits: { maxBudgetYenPerTask: 0, maxBudgetYenPer24Hours: 0, maxMissionsPer24Hours: 4, maxExecutionsPerTask: 2, maxDurationHours: 24, maxDelegationDepth: 0 },
    dataContracts: { kpi: "existing_performance_projection", revenue: "investment_pnl_not_revenue", cost: "business_cost_ledger" },
  },
  {
    id: "CONTENT",
    status: "ready",
    managerAgentId: "personal-note",
    workerAgentIds: ["creator-content", "creator-research", "creator-kpi"],
    limits: { maxBudgetYenPerTask: 0, maxBudgetYenPer24Hours: 0, maxMissionsPer24Hours: 4, maxExecutionsPerTask: 2, maxDurationHours: 24, maxDelegationDepth: 0 },
    dataContracts: { kpi: "existing_performance_projection", revenue: "revenue_ledger", cost: "business_cost_ledger" },
  },
  {
    id: "INCUBATION",
    status: "unassigned",
    managerAgentId: null,
    workerAgentIds: [],
    limits: { maxBudgetYenPerTask: 0, maxBudgetYenPer24Hours: 0, maxMissionsPer24Hours: 0, maxExecutionsPerTask: 1, maxDurationHours: 24, maxDelegationDepth: 0 },
    dataContracts: { kpi: "existing_performance_projection", revenue: "revenue_ledger", cost: "business_cost_ledger" },
  },
];

export type DelegationRequest = {
  businessId: MicroBusinessId;
  /** サーバーが認証・解決したmanager principal。モデル引数から取得しない。 */
  actorAgentId: string;
  workerAgentId: string;
  actionType: ActionType;
  budgetYen: number;
  /** Execution Storeからサーバーが集計した直近24hの予算予約。 */
  cumulativeBudgetYen: number;
  /** Execution Storeからサーバーが集計した直近24hの同一事業Mission数。 */
  missionsInLast24Hours: number;
  executionCount: number;
  deadline: string;
  /** 初回委任のみ許可。再委任は別の人間承認済み契約がない限り禁止。 */
  delegationDepth: number;
};

export type DelegationDecision =
  | { allowed: true; requiresHumanApproval: boolean; riskLevel: RiskLevel; businessId: MicroBusinessId; managerAgentId: string; workerAgentId: string }
  | { allowed: false; reason: string };

function findBusiness(id: MicroBusinessId) {
  return MICRO_BUSINESS_REGISTRY.find((business) => business.id === id);
}

function findCanonicalAgent(id: string) {
  for (const department of DEPARTMENTS) {
    for (const agent of department.secretaries ?? []) if (agent.id === id) return agent;
    for (const room of department.rooms ?? []) {
      for (const agent of room.secretaries) if (agent.id === id) return agent;
    }
  }
  return undefined;
}

/**
 * Manager→Worker委任可否を、固定Business割当・実在Agent・予算/回数/期限・Riskから判定する。
 * R2/R3は既存Approvalへ送る契約として許可し、R4と未知Actionは拒否する。
 * この判定自体はMission作成やAction実行を行わない。
 */
export function authorizeBusinessDelegation(
  request: DelegationRequest,
  now: Date = new Date()
): DelegationDecision {
  const business = findBusiness(request.businessId);
  if (!business || business.status !== "ready" || !business.managerAgentId) {
    return { allowed: false, reason: "BUSINESS_MANAGER_UNASSIGNED" };
  }
  if (request.actorAgentId !== business.managerAgentId || !findCanonicalAgent(request.actorAgentId)) {
    return { allowed: false, reason: "MANAGER_NOT_AUTHORIZED" };
  }
  if (!business.workerAgentIds.includes(request.workerAgentId) || !findCanonicalAgent(request.workerAgentId)) {
    return { allowed: false, reason: "WORKER_NOT_AUTHORIZED" };
  }
  const worker = findCanonicalAgent(request.workerAgentId);
  if (!worker) return { allowed: false, reason: "WORKER_NOT_AUTHORIZED" };
  if (request.delegationDepth !== 0 || business.limits.maxDelegationDepth !== 0) {
    return { allowed: false, reason: "REDELEGATION_FORBIDDEN" };
  }
  if (!Number.isFinite(request.budgetYen) || request.budgetYen < 0 || request.budgetYen > business.limits.maxBudgetYenPerTask) {
    return { allowed: false, reason: "BUDGET_LIMIT_EXCEEDED" };
  }
  if (!Number.isFinite(request.cumulativeBudgetYen) || request.cumulativeBudgetYen < 0 || request.cumulativeBudgetYen + request.budgetYen > business.limits.maxBudgetYenPer24Hours) {
    return { allowed: false, reason: "CUMULATIVE_BUDGET_LIMIT_EXCEEDED" };
  }
  if (!Number.isInteger(request.missionsInLast24Hours) || request.missionsInLast24Hours < 0 || request.missionsInLast24Hours >= business.limits.maxMissionsPer24Hours) {
    return { allowed: false, reason: "MISSION_RATE_LIMIT_EXCEEDED" };
  }
  if (!Number.isInteger(request.executionCount) || request.executionCount < 1 || request.executionCount > business.limits.maxExecutionsPerTask) {
    return { allowed: false, reason: "EXECUTION_LIMIT_EXCEEDED" };
  }

  const deadlineMs = Date.parse(request.deadline);
  const maxDeadline = now.getTime() + business.limits.maxDurationHours * 60 * 60 * 1000;
  if (!Number.isFinite(deadlineMs) || deadlineMs <= now.getTime() || deadlineMs > maxDeadline) {
    return { allowed: false, reason: "DEADLINE_OUT_OF_BOUNDS" };
  }

  if (!Object.prototype.hasOwnProperty.call(ACTION_RISK, request.actionType)) {
    return { allowed: false, reason: "UNKNOWN_ACTION" };
  }
  const riskLevel = ACTION_RISK[request.actionType];
  if (riskLevel === "R4") return { allowed: false, reason: "ACTION_PROHIBITED" };
  const workerPermissions = new Set(grantedPermissions(worker.permissions));
  if (permissionsFor(request.actionType).some((permission) => !workerPermissions.has(permission))) {
    return { allowed: false, reason: "WORKER_PERMISSION_MISSING" };
  }

  return {
    allowed: true,
    requiresHumanApproval: riskLevel === "R2" || riskLevel === "R3",
    riskLevel,
    businessId: business.id,
    managerAgentId: business.managerAgentId,
    workerAgentId: request.workerAgentId,
  };
}
