/**
 * Mission の実行ライフサイクル — Phase 6 §2 〜 §5 / §57
 *
 * Phase 5 の PersonalMission を拡張する（複製しない）。
 * 既存の status（open / in_progress / done / skipped / PLANNED / ACTIVE / COMPLETED）
 * との互換を保ち、実行用の状態を足す。
 *
 * §57 の要点: 状態遷移はすべて履歴に残す。上書きで履歴を失わない。
 */

import type { PersonalMission, MissionStatus } from "../missions";

/** Phase 6 で追加する実行中の状態 */
export type ExecutionMissionStatus =
  | "EXECUTING"
  | "REVIEWING"
  | "WAITING_APPROVAL"
  | "REPLAN_REQUIRED"
  | "FAILED"
  | "CANCELLED"
  | "BLOCKED";

export type FullMissionStatus = MissionStatus | ExecutionMissionStatus;

export type MissionTransition = {
  from: FullMissionStatus;
  to: FullMissionStatus;
  /** 誰が動かしたか。"system" / "ceo" / AI社員ID */
  actor: string;
  at: string;
  reason?: string;
};

export type ExecutionMission = Omit<PersonalMission, "status"> & {
  /** Durable store CAS version that last changed this mission. */
  version: number;
  status: FullMissionStatus;
  traceId?: string;
  assignedAgentId?: string;
  startedAt?: string;
  completedAt?: string;
  cancelledAt?: string;
  cancelReason?: string;
  /** §57 履歴。消さない */
  history: MissionTransition[];
  /** 紐づくActionRequestのID */
  actionRequestIds: string[];
  executionPlanId?: string;
};

/**
 * 許可する遷移。
 * ここに無い遷移は拒否する。状態が飛ぶと履歴の意味が壊れるため。
 */
const ALLOWED: Record<string, FullMissionStatus[]> = {
  PLANNED: ["ACTIVE", "CANCELLED", "BLOCKED"],
  open: ["ACTIVE", "CANCELLED", "BLOCKED"],
  ACTIVE: ["EXECUTING", "CANCELLED", "FAILED", "BLOCKED"],
  in_progress: ["EXECUTING", "CANCELLED", "FAILED"],
  EXECUTING: ["WAITING_APPROVAL", "REPLAN_REQUIRED", "REVIEWING", "FAILED", "CANCELLED", "BLOCKED"],
  REVIEWING: ["BLOCKED", "WAITING_APPROVAL", "COMPLETED", "FAILED", "REPLAN_REQUIRED"],
  WAITING_APPROVAL: ["EXECUTING", "BLOCKED", "COMPLETED", "REPLAN_REQUIRED", "FAILED", "CANCELLED"],
  REPLAN_REQUIRED: ["ACTIVE", "EXECUTING", "CANCELLED", "FAILED"],
  BLOCKED: ["ACTIVE", "CANCELLED", "FAILED"],
};

export function canTransition(from: FullMissionStatus, to: FullMissionStatus): boolean {
  return (ALLOWED[from] ?? []).includes(to);
}

export type TransitionResult =
  | { ok: true; mission: ExecutionMission }
  | { ok: false; error: string };

export function transition(
  mission: ExecutionMission,
  to: FullMissionStatus,
  options: { actor: string; reason?: string; now?: Date; patch?: Partial<ExecutionMission> } 
): TransitionResult {
  const now = options.now ?? new Date();

  if (!canTransition(mission.status, to)) {
    return { ok: false, error: `${mission.status} から ${to} へは遷移できません` };
  }

  return {
    ok: true,
    mission: {
      ...mission,
      ...(options.patch ?? {}),
      status: to,
      history: [
        ...mission.history,
        {
          from: mission.status,
          to,
          actor: options.actor,
          at: now.toISOString(),
          reason: options.reason,
        },
      ],
    },
  };
}

/** Phase 5 のMissionを実行用へ持ち上げる（既存フィールドは保つ） */
export function toExecutionMission(mission: PersonalMission): ExecutionMission {
  return {
    ...mission,
    version: 0,
    status: mission.status,
    history: [],
    actionRequestIds: [],
  };
}

/**
 * §4 完了できるか。
 * 承認が要るActionが未承認のまま残っていれば完了させない。
 */
export function canComplete(
  mission: ExecutionMission,
  pendingApprovals: { actionRequestId: string; status: string }[]
): { ok: boolean; reason?: string } {
  const blocking = pendingApprovals.filter(
    (approval) =>
      mission.actionRequestIds.includes(approval.actionRequestId) &&
      approval.status === "PENDING"
  );

  if (blocking.length > 0) {
    return {
      ok: false,
      reason: `承認待ちのActionが${blocking.length}件あります`,
    };
  }
  return { ok: true };
}
