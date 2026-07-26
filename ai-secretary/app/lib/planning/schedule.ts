/**
 * Time Blocking エンジン。
 *
 * 「優先順位 × 所要時間」から今日の時間割を自動生成する。
 * 時刻計算はLLMに任せず決定的に行う（毎朝の結果が安定し、破綻しないため）。
 * LLMは buildSuggestions() の助言レイヤーで使う。
 */

import { callAI } from "../ai/client";
import {
  DailyPlan,
  PlanTask,
  TimeBlock,
  toHHMM,
  toMinutes,
  formatDuration,
} from "./types";

/** ブロック間に空ける転換時間（分） */
const BUFFER_MINUTES = 10;

/**
 * 並び順のルール:
 *  1. 優先度が高いものから
 *  2. 同じ優先度なら長いタスクを先に（午前の集中力をdeep workへ充てる）
 */
function orderTasks(tasks: PlanTask[]): PlanTask[] {
  return [...tasks]
    .filter((task) => !task.done)
    .sort((a, b) => b.priority - a.priority || b.minutes - a.minutes);
}

/** 休憩を跨がないよう、必要なら開始位置を休憩明けまで送る */
function avoidBreak(start: number, minutes: number, breakStart: number, breakEnd: number): number {
  if (breakEnd <= breakStart) return start;
  const end = start + minutes;
  const overlaps = start < breakEnd && end > breakStart;
  return overlaps ? breakEnd : start;
}

export type ScheduleResult = {
  blocks: TimeBlock[];
  /** 稼働時間に収まらず割り当てられなかったタスク */
  overflow: PlanTask[];
};

export function buildSchedule(plan: DailyPlan, fromHHMM?: string): ScheduleResult {
  const workStart = toMinutes(plan.workStart);
  const workEnd = toMinutes(plan.workEnd);
  const breakStart = toMinutes(plan.breakStart);
  const breakEnd = toMinutes(plan.breakEnd);

  // 朝会を昼にやり直した場合などは「今から」詰め直す
  const begin = fromHHMM ? Math.max(workStart, toMinutes(fromHHMM)) : workStart;

  const blocks: TimeBlock[] = [];
  const overflow: PlanTask[] = [];
  let cursor = begin;

  for (const task of orderTasks(plan.tasks)) {
    const start = avoidBreak(cursor, task.minutes, breakStart, breakEnd);
    const end = start + task.minutes;

    if (end > workEnd) {
      overflow.push(task);
      continue;
    }

    blocks.push({
      taskId: task.id,
      title: task.title,
      start: toHHMM(start),
      end: toHHMM(end),
      bucket: task.bucket,
      priority: task.priority,
    });

    cursor = end + BUFFER_MINUTES;
  }

  return { blocks, overflow };
}

// ─── AI Suggest（画面右下の提案パネル） ───────────────────────

const SUGGEST_PROMPT = `あなたは1日の行動設計を見守るAI秘書です。
今日のタイムブロッキングを見て、実行しやすくなる提案を最大3件だけ出してください。

観点の例:
- 15分タスクが溜まっていればまとめて片付ける提案
- 午後は集中力が落ちるので、重いタスクを午前へ移す提案
- 稼働時間に入りきらなかったタスクの扱い（明日へ回す/分割する）
- 詰め込みすぎている場合の警告

必ず次のJSONのみを返す。説明文やコードブロックは不要。
{"suggestions":["提案文（40文字以内・敬体）", "..."]}`;

export async function buildSuggestions(
  plan: DailyPlan,
  overflow: PlanTask[]
): Promise<string[]> {
  if (plan.tasks.length === 0) return [];

  const blockText =
    plan.blocks.map((b) => `${b.start}-${b.end} ${b.title}（★${b.priority}）`).join("\n") ||
    "（時間割は未生成）";
  const overflowText =
    overflow.length > 0
      ? overflow.map((t) => `${t.title}（${formatDuration(t.minutes)}）`).join(", ")
      : "なし";

  const message = `稼働: ${plan.workStart}〜${plan.workEnd}（休憩 ${plan.breakStart}〜${plan.breakEnd}）
タスク数: ${plan.tasks.length}件（完了 ${plan.tasks.filter((t) => t.done).length}件）
15分: ${plan.tasks.filter((t) => t.bucket === "quick").length}件 / 30分: ${plan.tasks.filter((t) => t.bucket === "focus").length}件 / 60分以上: ${plan.tasks.filter((t) => t.bucket === "deep").length}件

今日の時間割:
${blockText}

入りきらなかったタスク: ${overflowText}`;

  try {
    const response = await callAI(message, SUGGEST_PROMPT, { provider: "auto" });
    const match = response.match(/\{[\s\S]*\}/);
    if (!match) return [];
    const parsed = JSON.parse(match[0]) as { suggestions?: unknown };
    if (!Array.isArray(parsed.suggestions)) return [];
    return parsed.suggestions
      .map((s) => String(s).trim())
      .filter(Boolean)
      .slice(0, 3);
  } catch (error) {
    console.error("[planning/schedule] AI提案の生成に失敗:", error);
    return [];
  }
}
