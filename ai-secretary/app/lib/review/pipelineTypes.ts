/**
 * 工程の進行状況の型と純粋な集計 — 要件7
 *
 * I/Oを持たないので、クライアントコンポーネントからも直接importできる。
 * Vault(fs)に触る loadPipeline は pipeline.ts 側に置く。
 *
 * 停滞の判定をここに集約しているのは、
 * UI側に閾値を置くと画面ごとに違う基準で「滞留」が出て信用できなくなるため。
 */

import type { AgentTask } from "@/app/lib/agents/types";
import { REVIEW_PHASE_LABELS, REVIEW_PHASE_ORDER, type ReviewItem, type ReviewPhase } from "./types";

/** これを超えて動いていないものを「滞留」と呼ぶ */
export const STALE_HOURS = 48;

/** 更新から STALE_HOURS 以上動いていないか。日付が壊れている場合は false */
export function isStale(updatedAt: string | null | undefined, now: Date = new Date()): boolean {
  if (!updatedAt) return false;
  const ms = now.getTime() - new Date(updatedAt).getTime();
  return Number.isFinite(ms) && ms > STALE_HOURS * 3_600_000;
}

export type PipelineStep = {
  phase: ReviewPhase;
  label: string;
  /** この工程で承認を待っている件数 */
  pending: number;
  /** この工程で動いているエージェントのタスク（未完了）件数 */
  tasks: number;
  /** 滞留している件数（承認待ち・タスクの合計） */
  stalled: number;
  /** 自動テスト未通過で先へ進めない件数 */
  blocked: number;
};

export type Pipeline = {
  steps: PipelineStep[];
  /** 全工程の承認待ち合計 */
  pendingTotal: number;
  /** 全工程の滞留合計。0でなければ画面で強調する */
  stalledTotal: number;
  blockedTotal: number;
  loadedAt: string;
};

/** 未完了のタスクだけを工程の対象にする（完了・失敗・取消は進行中ではない） */
function isOpenTask(task: AgentTask): boolean {
  return task.status === "queued" || task.status === "running";
}

export function buildPipeline(
  items: ReviewItem[],
  tasks: AgentTask[],
  now: Date = new Date()
): Pipeline {
  const openTasks = tasks.filter(isOpenTask);

  const steps: PipelineStep[] = REVIEW_PHASE_ORDER.map((phase) => {
    const phaseItems = items.filter((item) => item.phase === phase);
    const phaseTasks = openTasks.filter((task) => task.phase === phase);

    return {
      phase,
      label: REVIEW_PHASE_LABELS[phase],
      pending: phaseItems.length,
      tasks: phaseTasks.length,
      stalled:
        phaseItems.filter((item) => isStale(item.updatedAt, now)).length +
        phaseTasks.filter((task) => isStale(task.updatedAt, now)).length,
      blocked: phaseItems.filter((item) => item.qa && !item.qa.passed).length,
    };
  });

  return {
    steps,
    pendingTotal: steps.reduce((sum, step) => sum + step.pending, 0),
    stalledTotal: steps.reduce((sum, step) => sum + step.stalled, 0),
    blockedTotal: steps.reduce((sum, step) => sum + step.blocked, 0),
    loadedAt: now.toISOString(),
  };
}
