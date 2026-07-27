/**
 * Time Blocking エンジン。
 *
 * 1日は24時間しかないので、まず「仕事の枠」「自分の枠」を宣言しておき、
 * タスクはカテゴリの合う枠の中にだけ入れる。
 * 時刻計算はLLMに任せず決定的に行う（毎朝の結果が安定し、破綻しないため）。
 * LLMは buildSuggestions() の助言レイヤーで使う。
 */

import { callAI } from "../ai/client";
import {
  DailyPlan,
  PlanTask,
  TimeBlock,
  TimeWindow,
  TIME_HINT_RANGES,
  toHHMM,
  toMinutes,
  formatDuration,
  windowCapacity,
} from "./types";

/** ブロック間に空ける転換時間（分） */
const BUFFER_MINUTES = 10;

/**
 * 並び順のルール:
 *  1. 優先度が高いものから
 *  2. 同じ優先度なら長いタスクを先に（枠の前半をdeep workへ充てる）
 */
function orderTasks(tasks: PlanTask[]): PlanTask[] {
  return [...tasks]
    .filter((task) => !task.done)
    .sort((a, b) => b.priority - a.priority || b.minutes - a.minutes);
}

/**
 * windows未設定の古いプラン向けに、旧フィールドから枠を組み立てる。
 * 稼働時間を仕事枠、昼休みをプライベート枠として扱う。
 */
export function fallbackWindows(plan: DailyPlan): TimeWindow[] {
  const windows: TimeWindow[] = [];
  const hasBreak = toMinutes(plan.breakEnd) > toMinutes(plan.breakStart);

  if (hasBreak && toMinutes(plan.breakStart) > toMinutes(plan.workStart)) {
    windows.push({
      id: "legacy-am",
      label: "午前の仕事",
      start: plan.workStart,
      end: plan.breakStart,
      category: "work",
    });
    windows.push({
      id: "legacy-break",
      label: "昼休み",
      start: plan.breakStart,
      end: plan.breakEnd,
      category: "life",
    });
    windows.push({
      id: "legacy-pm",
      label: "午後の仕事",
      start: plan.breakEnd,
      end: plan.workEnd,
      category: "work",
    });
  } else {
    windows.push({
      id: "legacy-day",
      label: "稼働時間",
      start: plan.workStart,
      end: plan.workEnd,
      category: "work",
    });
  }
  return windows;
}

export function resolveWindows(plan: DailyPlan): TimeWindow[] {
  return plan.windows && plan.windows.length > 0 ? plan.windows : fallbackWindows(plan);
}

export type ScheduleResult = {
  blocks: TimeBlock[];
  /** 枠に収まらず割り当てられなかったタスク */
  overflow: PlanTask[];
  /** 使用した枠（UIの帯表示に使う） */
  windows: TimeWindow[];
};

/** 既に埋まっている時間帯 */
type Busy = { start: number; end: number };

/**
 * 指定カテゴリの枠の中から、minutes 分の空きが取れる最早の開始時刻を探す。
 * 見つからなければ null（＝はみ出し）。
 */
function findSlot(
  windows: TimeWindow[],
  busy: Busy[],
  task: PlanTask,
  floor: number
): number | null {
  const candidates = windows.filter((w) => !task.category || w.category === task.category);

  // 時間帯の希望がある枠を先に試す（「夕食を作る」が昼休み枠に入らないように）
  const hint = task.timeHint && task.timeHint !== "any" ? TIME_HINT_RANGES[task.timeHint] : null;
  const ordered = hint
    ? [
        ...candidates.filter(
          (w) => toMinutes(w.start) < hint[1] && toMinutes(w.end) > hint[0]
        ),
        ...candidates.filter(
          (w) => !(toMinutes(w.start) < hint[1] && toMinutes(w.end) > hint[0])
        ),
      ]
    : candidates;

  for (const window of ordered) {
    const windowEnd = toMinutes(window.end);
    let cursor = Math.max(toMinutes(window.start), floor);

    const overlapping = busy
      .filter((b) => b.end > cursor && b.start < windowEnd)
      .sort((a, b) => a.start - b.start);

    for (const block of overlapping) {
      if (cursor + task.minutes <= block.start) return cursor;
      cursor = Math.max(cursor, block.end + BUFFER_MINUTES);
    }
    if (cursor + task.minutes <= windowEnd) return cursor;
  }
  return null;
}

function toBlock(task: PlanTask, start: number, pinned: boolean): TimeBlock {
  return {
    taskId: task.id,
    title: task.title,
    start: toHHMM(start),
    end: toHHMM(start + task.minutes),
    bucket: task.bucket,
    priority: task.priority,
    ...(task.category ? { category: task.category } : {}),
    ...(pinned ? { pinned: true } : {}),
  };
}

export function buildSchedule(plan: DailyPlan, fromHHMM?: string): ScheduleResult {
  const windows = resolveWindows(plan);
  const floor = fromHHMM ? toMinutes(fromHHMM) : 0;

  const pending = orderTasks(plan.tasks);
  const blocks: TimeBlock[] = [];
  const overflow: PlanTask[] = [];
  const busy: Busy[] = [];

  // 1. 手動で固定されたタスクを先に置く（ドラッグした位置は必ず尊重する）
  const pinned = pending.filter((t) => t.pinnedStart);
  for (const task of pinned) {
    const start = toMinutes(task.pinnedStart as string);
    blocks.push(toBlock(task, start, true));
    busy.push({ start, end: start + task.minutes });
  }

  // 2. 残りを空いている枠へ優先度順に詰める
  for (const task of pending) {
    if (task.pinnedStart) continue;
    const start = findSlot(windows, busy, task, floor);
    if (start === null) {
      overflow.push(task);
      continue;
    }
    blocks.push(toBlock(task, start, false));
    busy.push({ start, end: start + task.minutes });
  }

  blocks.sort((a, b) => toMinutes(a.start) - toMinutes(b.start));
  return { blocks, overflow, windows };
}

// ─── AI Suggest（画面右下の提案パネル） ───────────────────────

const SUGGEST_PROMPT = `あなたは1日の行動設計を見守るAI秘書です。
今日のタイムブロッキングを見て、実行しやすくなる提案を最大3件だけ出してください。

観点の例:
- 仕事枠／自分の枠に対して、詰め込みすぎ・空きすぎていないか
- 15分タスクが溜まっていればまとめて片付ける提案
- 午後は集中力が落ちるので、重いタスクを午前へ移す提案
- 枠に入りきらなかったタスクの扱い（明日へ回す/分割する/枠を広げる）

必ず次のJSONのみを返す。説明文やコードブロックは不要。
{"suggestions":["提案文（40文字以内・敬体）", "..."]}`;

export async function buildSuggestions(
  plan: DailyPlan,
  overflow: PlanTask[],
  windows: TimeWindow[]
): Promise<string[]> {
  if (plan.tasks.length === 0) return [];

  const capacity = windowCapacity(windows);
  const assigned = { work: 0, life: 0 };
  for (const block of plan.blocks) {
    const minutes = toMinutes(block.end) - toMinutes(block.start);
    if (block.category === "life") assigned.life += minutes;
    else assigned.work += minutes;
  }

  const windowText = windows
    .map(
      (w) => `${w.start}-${w.end} ${w.category === "work" ? "💼仕事" : "🏠自分"}（${w.label}）`
    )
    .join("\n");
  const blockText =
    plan.blocks.map((b) => `${b.start}-${b.end} ${b.title}（★${b.priority}）`).join("\n") ||
    "（時間割は未生成）";
  const overflowText =
    overflow.length > 0
      ? overflow
          .map((t) => `${t.title}（${formatDuration(t.minutes)}・${t.category === "life" ? "生活" : "仕事"}）`)
          .join(", ")
      : "なし";

  const message = `【今日の枠】
${windowText}

【枠の容量と使用量】
仕事: ${formatDuration(capacity.work)}中 ${formatDuration(assigned.work)}を使用
自分の時間: ${formatDuration(capacity.life)}中 ${formatDuration(assigned.life)}を使用

【時間割】
${blockText}

【枠に入りきらなかったタスク】${overflowText}`;

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
