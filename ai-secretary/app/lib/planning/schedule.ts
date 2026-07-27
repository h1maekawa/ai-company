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

/** 枠ごとの空き状況。cursor は次に置ける最早時刻 */
type Slot = { window: TimeWindow; cursor: number; end: number };

export function buildSchedule(plan: DailyPlan, fromHHMM?: string): ScheduleResult {
  const windows = resolveWindows(plan);
  const floor = fromHHMM ? toMinutes(fromHHMM) : 0;

  const slots: Slot[] = windows.map((window) => ({
    window,
    cursor: Math.max(toMinutes(window.start), floor),
    end: toMinutes(window.end),
  }));

  const blocks: TimeBlock[] = [];
  const overflow: PlanTask[] = [];

  for (const task of orderTasks(plan.tasks)) {
    // カテゴリが決まっていれば合う枠だけ、未分類ならどの枠でも候補にする
    const candidates = slots.filter(
      (slot) => !task.category || slot.window.category === task.category
    );
    const fits = candidates.filter((s) => s.cursor + task.minutes <= s.end);

    // 時間帯の希望がある場合、その帯と重なる枠を先に試す
    // （「夕食を作る」が昼休み枠に入ってしまうのを防ぐ）
    const hint = task.timeHint && task.timeHint !== "any" ? TIME_HINT_RANGES[task.timeHint] : null;
    const preferred = hint
      ? fits.filter((s) => s.cursor < hint[1] && s.end > hint[0])
      : [];

    const slot = preferred[0] ?? fits[0];
    if (!slot) {
      overflow.push(task);
      continue;
    }

    const start = slot.cursor;
    const end = start + task.minutes;
    blocks.push({
      taskId: task.id,
      title: task.title,
      start: toHHMM(start),
      end: toHHMM(end),
      bucket: task.bucket,
      priority: task.priority,
      ...(task.category ? { category: task.category } : {}),
    });

    slot.cursor = end + BUFFER_MINUTES;
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
