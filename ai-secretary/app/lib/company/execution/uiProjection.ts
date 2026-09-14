import type { FullMissionStatus } from "./mission";

export type TaskBoardColumn = "todo" | "progress" | "ceo_review" | "done";
export type SimpleUiStatus =
  | "待機中"
  | "作業中"
  | "レビュー中"
  | "CEO確認待ち"
  | "問題あり"
  | "完了";

export const TASK_BOARD_COLUMNS: Array<{ id: TaskBoardColumn; label: string }> = [
  { id: "todo", label: "やること" },
  { id: "progress", label: "進行中" },
  { id: "ceo_review", label: "CEO確認待ち" },
  { id: "done", label: "完了" },
];

/** Mission remains the source of truth; this is a display-only projection. */
export function projectMissionForUi(status: FullMissionStatus): {
  column: TaskBoardColumn;
  status: SimpleUiStatus;
} {
  switch (status) {
    case "COMPLETED":
    case "done":
      return { column: "done", status: "完了" };
    case "WAITING_APPROVAL":
      return { column: "ceo_review", status: "CEO確認待ち" };
    case "REVIEWING":
      return { column: "progress", status: "レビュー中" };
    case "ACTIVE":
    case "in_progress":
    case "EXECUTING":
    case "REPLAN_REQUIRED":
      return { column: "progress", status: "作業中" };
    case "FAILED":
    case "BLOCKED":
    case "CANCELLED":
    case "skipped":
      return { column: "todo", status: "問題あり" };
    case "PLANNED":
    case "open":
    default:
      return { column: "todo", status: "待機中" };
  }
}

/** ヘッダーに出す会社全体の集計。AI社員の表示状態を数えるだけ。 */
export type OfficeSummary = {
  working: number;
  idle: number;
  ceoReview: number;
  problem: number;
};

/** 完了はそのAI社員が今は空いていることを意味するので、待機として数える。 */
export function summarizeOffice(statuses: SimpleUiStatus[]): OfficeSummary {
  const summary: OfficeSummary = { working: 0, idle: 0, ceoReview: 0, problem: 0 };
  for (const status of statuses) {
    if (status === "作業中" || status === "レビュー中") summary.working += 1;
    else if (status === "CEO確認待ち") summary.ceoReview += 1;
    else if (status === "問題あり") summary.problem += 1;
    else summary.idle += 1;
  }
  return summary;
}

export type CurrentStepView = { title: string; index: number; total: number };

/**
 * 現在のStep。既存のExecution Planからだけ導出する。
 * 進捗用の状態を別に持たないので、Planが無ければ何も表示しない。
 */
export function projectCurrentStep(
  steps: Array<{ order: number; title: string; status: string }>,
): CurrentStepView | undefined {
  if (steps.length === 0) return undefined;
  const ordered = [...steps].sort((a, b) => a.order - b.order);
  const current = ordered.find((step) => step.status === "RUNNING")
    ?? ordered.find((step) => step.status !== "COMPLETE");
  if (!current) return undefined;
  return { title: current.title, index: ordered.indexOf(current) + 1, total: ordered.length };
}

/**
 * なぜ止まっているか。CEOが理由を探しに行かなくて済むよう1行で返す。
 * Backendが記録した理由だけを使う。UI側で原因を推測しない（§39）。
 */
export function projectWaitReason(input: {
  status: SimpleUiStatus;
  pendingApprovalTitle?: string;
  blockedActionReason?: string;
  cancelReason?: string;
  lastTransitionReason?: string;
}): string | undefined {
  if (input.status === "CEO確認待ち") return input.pendingApprovalTitle ?? "CEOの承認を待っています";
  if (input.status === "問題あり")
    return input.blockedActionReason
      ?? input.cancelReason
      ?? input.lastTransitionReason
      ?? "理由が記録されていません";
  return undefined;
}
