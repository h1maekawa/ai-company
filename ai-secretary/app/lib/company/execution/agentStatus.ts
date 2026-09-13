/**
 * AI社員の状態 — Phase 6 §38 / §39 / §44
 *
 * §39 の要点: UI側で状態を推測しない。
 * Mission と Action の実状態から計算し、Backendを唯一の出所にする。
 * 画面ごとに推測すると、同じAI社員が別の画面で違う状態に見える。
 */

import type { AgentSummary } from "../organization";
import type { ExecutionMission } from "./mission";
import type { ActionRequest } from "./actionGateway";
import type { ApprovalRequest } from "./approval";
import { computeAgentLevel } from "./xp";

export type AgentActivityStatus =
  | "IDLE"
  | "THINKING"
  | "RESEARCHING"
  | "EXECUTING"
  | "REVIEWING"
  | "WAITING_APPROVAL"
  | "COMPLETE"
  | "ERROR";

export const AGENT_STATUS_LABELS: Record<AgentActivityStatus, string> = {
  IDLE: "待機中",
  THINKING: "計画中",
  RESEARCHING: "調査中",
  EXECUTING: "作業中",
  REVIEWING: "確認中",
  WAITING_APPROVAL: "承認待ち",
  COMPLETE: "完了",
  ERROR: "エラー",
};

export type AgentLiveStatus = {
  agentId: string;
  name: string;
  role: string;
  departmentId: string;
  riskLevel: string;
  status: AgentActivityStatus;
  currentMissionId?: string;
  currentMissionTitle?: string;
  level: number;
  activeMissions: number;
  completedMissions: number;
  /** 収益貢献はレベルと分けて表示する（§45） */
  attributedRevenueYen: number;
};

/** Missionの状態 → AI社員の状態。優先順位は「今まさに何をしているか」 */
function statusFromMission(mission: ExecutionMission): AgentActivityStatus {
  switch (mission.status) {
    case "EXECUTING":
      return "EXECUTING";
    case "REVIEWING":
      return "REVIEWING";
    case "WAITING_APPROVAL":
      return "WAITING_APPROVAL";
    case "ACTIVE":
      return "THINKING";
    case "FAILED":
    case "BLOCKED":
      return "ERROR";
    case "COMPLETED":
      return "COMPLETE";
    default:
      return "IDLE";
  }
}

/** 進行中とみなすMission。並び替えの優先順位も兼ねる */
const ACTIVE_ORDER: Record<string, number> = {
  EXECUTING: 0,
  REVIEWING: 1,
  WAITING_APPROVAL: 2,
  ACTIVE: 3,
};

export function computeAgentStatuses(input: {
  agents: AgentSummary[];
  missions: ExecutionMission[];
  actionRequests?: ActionRequest[];
  approvals?: ApprovalRequest[];
  revenueByAgent?: Record<string, number>;
  reviewPassRateByAgent?: Record<string, number | null>;
}): AgentLiveStatus[] {
  return input.agents.map((agent) => {
    const mine = input.missions.filter((m) => m.assignedAgentId === agent.id);
    const active = mine
      .filter((m) => m.status in ACTIVE_ORDER)
      .sort((a, b) => ACTIVE_ORDER[a.status] - ACTIVE_ORDER[b.status]);
    const completed = mine.filter((m) => m.status === "COMPLETED");
    const failed = mine.filter((m) => m.status === "FAILED" || m.status === "BLOCKED");

    const current = active[0];
    const status: AgentActivityStatus = current
      ? statusFromMission(current)
      : failed.length > 0
        ? "ERROR"
        : "IDLE";

    const decided = (input.approvals ?? []).filter(
      (a) => a.requestedBy === agent.id && a.status !== "PENDING"
    );
    const rejected = decided.filter((a) => a.status === "REJECTED");

    return {
      agentId: agent.id,
      name: agent.name,
      role: agent.role,
      departmentId: agent.departmentId,
      riskLevel: agent.riskLevel,
      status,
      currentMissionId: current?.id,
      currentMissionTitle: current?.title,
      level: computeAgentLevel({
        completedMissions: completed.length,
        successRate: mine.length > 0 ? completed.length / mine.length : 0,
        reviewPassRate: input.reviewPassRateByAgent?.[agent.id] ?? (decided.length > 0 ? 1 - rejected.length / decided.length : 0),
        ceoRejectionRate: decided.length > 0 ? rejected.length / decided.length : 0,
      }),
      activeMissions: active.length,
      completedMissions: completed.length,
      attributedRevenueYen: input.revenueByAgent?.[agent.id] ?? 0,
    };
  });
}
