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
