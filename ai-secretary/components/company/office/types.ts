/**
 * Simple Pixel Office v2 のUI専用ビューモデル。
 *
 * Mission / Agent / Department の正はBackend。
 * ここに置くのは「画面に出す形」だけで、状態の出所にはしない（Phase 6 §39）。
 */

import type {
  CurrentStepView,
  SimpleUiStatus,
  TaskBoardColumn,
} from "@/app/lib/company/execution/uiProjection";

export type AgentView = {
  agentId: string;
  name: string;
  role: string;
  status: SimpleUiStatus;
  currentMissionTitle?: string;
  currentStep?: CurrentStepView;
  /** CEO確認待ち / 問題あり のときだけ入る */
  waitReason?: string;
};

export type TaskView = {
  missionId: string;
  title: string;
  description: string;
  column: TaskBoardColumn;
  status: SimpleUiStatus;
  departmentName?: string;
  departmentIcon?: string;
  assigneeName?: string;
  currentStep?: CurrentStepView;
  waitReason?: string;
};

export type DepartmentView = {
  id: string;
  name: string;
  icon: string;
  agents: AgentView[];
  working: number;
  idle: number;
  taskCount: number;
};

/** 状態の見た目は1か所に集約する。同じ状態が画面ごとに違う色になるのを防ぐ。 */
export const STATUS_STYLE: Record<SimpleUiStatus, string> = {
  待機中: "border-slate-500/30 bg-white/5 text-sub",
  作業中: "border-sky-400/30 bg-sky-400/10 text-sky-300",
  レビュー中: "border-violet-400/30 bg-violet-400/10 text-violet-300",
  CEO確認待ち: "border-amber-400/40 bg-amber-400/10 text-amber-300",
  問題あり: "border-loss/40 bg-loss/10 text-loss",
  完了: "border-gain/30 bg-gain/10 text-gain",
};

export const STATUS_DOT: Record<SimpleUiStatus, string> = {
  待機中: "bg-slate-500",
  作業中: "bg-sky-400",
  レビュー中: "bg-violet-400",
  CEO確認待ち: "bg-amber-400",
  問題あり: "bg-loss",
  完了: "bg-gain",
};

/** Pixel Artの見た目は少数に絞る。状態理解の補助なので細かく分けない。 */
export type PixelPose = "working" | "review" | "alert" | "idle";

export function poseOf(status: SimpleUiStatus): PixelPose {
  if (status === "作業中") return "working";
  if (status === "レビュー中" || status === "CEO確認待ち") return "review";
  // 止まっている席にコーヒーを置くと「休憩中」に見える。問題は問題として見せる。
  if (status === "問題あり") return "alert";
  return "idle";
}
