/**
 * 実行サービス — Phase 6 §3 〜 §8
 *
 * APIから呼ばれる操作をここへ集約する。
 * ルート側は薄く保ち、判断はすべてこの層に置く。
 */

import { buildOrganizationSnapshot } from "../organization";
import { startTrace } from "../trace";
import { assignAgent, computeWorkloads } from "./assignment";
import { createExecutionPlan, defaultPlanSteps } from "./executionPlan";
import { canComplete, toExecutionMission, transition, type ExecutionMission } from "./mission";
import { applyExpiry, createApprovalRequest, decideApproval } from "./approval";
import { reviewActionRequest } from "./actionGateway";
import { loadExecutionState, saveExecutionState, type ExecutionState } from "./store";
import type { PersonalMission } from "../missions";

export type ServiceResult<T> = { ok: true; data: T } | { ok: false; error: string; status: number };

const fail = (status: number, error: string) => ({ ok: false as const, error, status });

/** Money Quest を実行対象として取り込む（まだ無ければ作る） */
export function ensureMission(
  state: ExecutionState,
  missionId: string,
  fallback?: PersonalMission
): ExecutionMission | null {
  const existing = state.missions.find((m) => m.id === missionId);
  if (existing) return existing;
  return fallback ? toExecutionMission(fallback) : null;
}

/* ─── §3 Start ──────────────────────────────────── */

export async function startMission(input: {
  missionId: string;
  mission?: PersonalMission;
  now?: Date;
}): Promise<ServiceResult<{ mission: ExecutionMission; state: ExecutionState }>> {
  const now = input.now ?? new Date();
  const state = await loadExecutionState();
  const mission = ensureMission(state, input.missionId, input.mission);
  if (!mission) return fail(404, "そのミッションが見つかりません");

  const organization = buildOrganizationSnapshot(now);
  const assignment = assignAgent({
    organization,
    workloads: computeWorkloads(state.missions),
    requiredAgents: input.mission?.opportunityId ? [] : [],
    departmentId: "personal",
    routerAgentId: "executive-assistant",
  });

  if (!assignment.assigned) {
    // 担当がいないことを握りつぶさない。組織進化の材料として残す
    const blockedResult = transition(mission, "BLOCKED", {
      actor: "system",
      reason: assignment.detail,
      now,
    });
    if (blockedResult.ok) {
      const next = upsertMission(state, blockedResult.mission);
      await saveExecutionState(next);
    }
    return fail(409, `NO_SUITABLE_AGENT: ${assignment.detail}`);
  }

  const trace = startTrace({ departmentId: "personal", agentId: assignment.agentId }, now);
  const result = transition(mission, "ACTIVE", {
    actor: "ceo",
    reason: "CEOが開始",
    now,
    patch: {
      traceId: trace.traceId,
      assignedAgentId: assignment.agentId,
      startedAt: now.toISOString(),
    },
  });
  if (!result.ok) return fail(409, result.error);

  // 実行前に計画を出す（§12）。いきなり実行させない
  const plan = createExecutionPlan({
    missionId: mission.id,
    traceId: trace.traceId,
    agentId: assignment.agentId,
    objective: mission.title,
    steps: defaultPlanSteps(mission.title),
    expectedOutputs: ["下書き"],
    now,
  });

  const withPlan: ExecutionMission = { ...result.mission, executionPlanId: plan.id };
  const next: ExecutionState = {
    ...upsertMission(state, withPlan),
    plans: [...state.plans, plan],
  };
  await saveExecutionState(next);

  return { ok: true, data: { mission: withPlan, state: next } };
}

/* ─── §4 Complete ───────────────────────────────── */

export async function completeMission(input: {
  missionId: string;
  now?: Date;
}): Promise<ServiceResult<{ mission: ExecutionMission }>> {
  const now = input.now ?? new Date();
  const state = await loadExecutionState();
  const mission = state.missions.find((m) => m.id === input.missionId);
  if (!mission) return fail(404, "そのミッションが見つかりません");

  // 承認待ちが残っていれば完了させない（§4 / §69）
  const check = canComplete(mission, state.approvals);
  if (!check.ok) return fail(409, check.reason ?? "完了できません");

  const result = transition(mission, "COMPLETED", {
    actor: "ceo",
    reason: "完了",
    now,
    patch: { completedAt: now.toISOString() },
  });
  if (!result.ok) return fail(409, result.error);

  await saveExecutionState(upsertMission(state, result.mission));
  return { ok: true, data: { mission: result.mission } };
}

/* ─── §5 Cancel ─────────────────────────────────── */

export async function cancelMission(input: {
  missionId: string;
  reason: string;
  now?: Date;
}): Promise<ServiceResult<{ mission: ExecutionMission }>> {
  const now = input.now ?? new Date();
  if (!input.reason?.trim()) return fail(400, "中止には理由が必要です");

  const state = await loadExecutionState();
  const mission = state.missions.find((m) => m.id === input.missionId);
  if (!mission) return fail(404, "そのミッションが見つかりません");

  const result = transition(mission, "CANCELLED", {
    actor: "ceo",
    reason: input.reason,
    now,
    patch: { cancelledAt: now.toISOString(), cancelReason: input.reason },
  });
  if (!result.ok) return fail(409, result.error);

  await saveExecutionState(upsertMission(state, result.mission));
  return { ok: true, data: { mission: result.mission } };
}

/* ─── Action の依頼（Gateway経由） ──────────────── */

export async function requestAction(input: {
  missionId: string;
  actionType: string;
  payloadSummary: string;
  target?: string;
  origin?: "agent" | "human" | "external_content";
  now?: Date;
}): Promise<ServiceResult<{ decision: ReturnType<typeof reviewActionRequest> }>> {
  const now = input.now ?? new Date();
  const state = await loadExecutionState();
  const mission = state.missions.find((m) => m.id === input.missionId);
  if (!mission) return fail(404, "そのミッションが見つかりません");

  const organization = buildOrganizationSnapshot(now);
  const agent = organization.agents.find((a) => a.id === mission.assignedAgentId) ?? null;

  const decision = reviewActionRequest({
    missionId: mission.id,
    traceId: mission.traceId ?? "unknown",
    agent,
    actionType: input.actionType,
    payloadSummary: input.payloadSummary,
    target: input.target,
    origin: input.origin,
    now,
  });

  const approvals = [...state.approvals];
  let request = decision.request;

  if (decision.needsApproval) {
    const approval = createApprovalRequest({
      actionRequestId: request.id,
      title: `${mission.title}: ${input.actionType}`,
      summary: input.payloadSummary,
      riskLevel: request.riskLevel,
      requestedBy: request.requestedByAgentId,
      missionId: mission.id,
      now,
    });
    approvals.push(approval);
    request = { ...request, approvalId: approval.id };
  }

  const next: ExecutionState = {
    ...upsertMission(state, {
      ...mission,
      actionRequestIds: [...new Set([...mission.actionRequestIds, request.id])],
    }),
    actionRequests: [...state.actionRequests, request],
    approvals,
  };
  await saveExecutionState(next);

  return { ok: true, data: { decision: { ...decision, request } } };
}

/* ─── §27 承認 ──────────────────────────────────── */

export async function decideApprovalRequest(input: {
  approvalId: string;
  decision: "APPROVED" | "REJECTED";
  reason?: string;
  now?: Date;
}): Promise<ServiceResult<{ state: ExecutionState }>> {
  const now = input.now ?? new Date();
  const loaded = await loadExecutionState();
  const state: ExecutionState = { ...loaded, approvals: applyExpiry(loaded.approvals, now) };

  const approval = state.approvals.find((a) => a.id === input.approvalId);
  if (!approval) return fail(404, "その承認が見つかりません");

  const result = decideApproval(approval, input.decision, { reason: input.reason, now });
  if (!result.ok) return fail(409, result.error);

  const approvals = state.approvals.map((a) => (a.id === approval.id ? result.approval : a));
  const actionRequests = state.actionRequests.map((request) =>
    request.id === approval.actionRequestId
      ? {
          ...request,
          status: input.decision === "APPROVED" ? ("APPROVED" as const) : ("REJECTED" as const),
          reason: input.reason,
          updatedAt: now.toISOString(),
        }
      : request
  );

  /*
   * §28 却下されてもMissionを即FAILEDにしない。
   * 直して再提出できるよう REPLAN_REQUIRED へ戻す。
   */
  let missions = state.missions;
  if (input.decision === "REJECTED") {
    const mission = missions.find((m) => m.id === approval.missionId);
    if (mission) {
      const moved = transition(mission, "REPLAN_REQUIRED", {
        actor: "ceo",
        reason: input.reason ?? "却下",
        now,
      });
      if (moved.ok) missions = missions.map((m) => (m.id === mission.id ? moved.mission : m));
    }
  }

  const next: ExecutionState = { ...state, approvals, actionRequests, missions };
  await saveExecutionState(next);
  return { ok: true, data: { state: next } };
}

function upsertMission(state: ExecutionState, mission: ExecutionMission): ExecutionState {
  const exists = state.missions.some((m) => m.id === mission.id);
  return {
    ...state,
    missions: exists
      ? state.missions.map((m) => (m.id === mission.id ? mission : m))
      : [...state.missions, mission],
  };
}
