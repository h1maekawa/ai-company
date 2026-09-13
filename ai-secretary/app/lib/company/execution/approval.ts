/**
 * 承認キュー — Phase 6 §25 〜 §29 / §69
 *
 * CEOが判断する対象を1か所に集める。
 *
 * §28 の要点: 却下されたMissionを即FAILEDにしない。
 * 文面を直して再承認に回せるよう REPLAN_REQUIRED を用意する。
 * 一度の却下で仕事が死ぬと、AIは何も学べないまま終わる。
 */

import type { RiskLevel } from "../agentTypes";

export type ApprovalStatus = "PENDING" | "APPROVED" | "REJECTED" | "EXPIRED";

export type ApprovalRequest = {
  id: string;
  actionRequestId: string;
  title: string;
  summary: string;
  riskLevel: RiskLevel;
  /** 依頼したAI社員 */
  requestedBy: string;
  missionId: string;

  /** Reviewerの結果。CEOが判断材料にする */
  reviewSummary?: { quality: string; security: string };

  status: ApprovalStatus;
  createdAt: string;
  decidedAt?: string;
  decisionReason?: string;
  /** §29 期限。過ぎた承認では実行しない */
  expiresAt?: string;
};

/** 承認の既定の有効期限（時間）。長く放置された判断で実行しないため */
export const DEFAULT_EXPIRY_HOURS = 72;

export function createApprovalRequest(input: {
  actionRequestId: string;
  title: string;
  summary: string;
  riskLevel: RiskLevel;
  requestedBy: string;
  missionId: string;
  reviewSummary?: ApprovalRequest["reviewSummary"];
  expiryHours?: number;
  now?: Date;
}): ApprovalRequest {
  const now = input.now ?? new Date();
  const hours = input.expiryHours ?? DEFAULT_EXPIRY_HOURS;

  return {
    id: `apr_${now.getTime().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
    actionRequestId: input.actionRequestId,
    title: input.title,
    summary: input.summary,
    riskLevel: input.riskLevel,
    requestedBy: input.requestedBy,
    missionId: input.missionId,
    reviewSummary: input.reviewSummary,
    status: "PENDING",
    createdAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + hours * 3_600_000).toISOString(),
  };
}

export function isExpired(approval: ApprovalRequest, now: Date = new Date()): boolean {
  if (!approval.expiresAt) return false;
  return new Date(approval.expiresAt).getTime() < now.getTime();
}

/** 期限切れを反映する（保存時に呼ぶ。自動Expireは簡易で良い・§29） */
export function applyExpiry(
  approvals: ApprovalRequest[],
  now: Date = new Date()
): ApprovalRequest[] {
  return approvals.map((approval) =>
    approval.status === "PENDING" && isExpired(approval, now)
      ? { ...approval, status: "EXPIRED" as const }
      : approval
  );
}

export type DecisionResult =
  | { ok: true; approval: ApprovalRequest }
  | { ok: false; error: string };

export function decideApproval(
  approval: ApprovalRequest,
  decision: "APPROVED" | "REJECTED",
  options: { reason?: string; now?: Date } = {}
): DecisionResult {
  const now = options.now ?? new Date();

  if (approval.status !== "PENDING") {
    return { ok: false, error: `この承認は既に ${approval.status} です` };
  }
  if (isExpired(approval, now)) {
    return { ok: false, error: "承認の有効期限が切れています" };
  }
  if (decision === "REJECTED" && !options.reason?.trim()) {
    // 理由の無い却下はAgentへのフィードバックにならない
    return { ok: false, error: "却下には理由が必要です" };
  }

  return {
    ok: true,
    approval: {
      ...approval,
      status: decision,
      decidedAt: now.toISOString(),
      decisionReason: options.reason,
    },
  };
}
