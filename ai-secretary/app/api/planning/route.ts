import { NextRequest, NextResponse } from "next/server";
import {
  findPreviousPlanDate,
  loadPlan,
  planExists,
  savePlan,
} from "@/app/lib/planning/store";
import {
  DailyPlan,
  PlanTask,
  Priority,
  TaskBucket,
  TaskCategory,
  summarizePlan,
  todayJst,
  nowJst,
  windowsForDate,
} from "@/app/lib/planning/types";
import { isCalendarConfigured } from "@/app/lib/planning/calendar";
import { loadTemplate } from "@/app/lib/planning/template";

// リクエストごとにVault/環境変数を読むため静的化しない
export const dynamic = "force-dynamic";

function withSummary(plan: DailyPlan) {
  return {
    plan,
    summary: summarizePlan(plan, nowJst()),
    calendarConfigured: isCalendarConfigured(),
  };
}

export async function GET(req: NextRequest) {
  try {
    const date = req.nextUrl.searchParams.get("date") || todayJst();
    const isNewDay = !(await planExists(date));
    const plan = await loadPlan(date);

    // 時間割未生成でも枠は見せたいので、未設定ならテンプレートから解決する
    if (!plan.windows || plan.windows.length === 0) {
      const template = await loadTemplate();
      plan.windows = windowsForDate(template, date);
    }

    // 日付が変わっても未完了タスクが消えないよう、前回のプランから引き継ぐ。
    // その日のファイルを作った時点で1回だけ行うので、あとで消しても復活しない。
    if (isNewDay) {
      const previousDate = await findPreviousPlanDate(date);
      if (previousDate) {
        const previous = await loadPlan(previousDate);
        const carried = previous.tasks
          .filter((task) => !task.done)
          .map((task) => {
            // 前日の固定時刻は今日の予定として妥当とは限らないため外す
            const { pinnedStart: _drop, ...rest } = task;
            return { ...rest, carriedFrom: task.carriedFrom ?? previousDate };
          });

        if (carried.length > 0) {
          const saved = await savePlan({ ...plan, tasks: carried });
          return NextResponse.json({ ...withSummary(saved), carriedOver: carried.length });
        }
      }
    }

    return NextResponse.json(withSummary(plan));
  } catch (error) {
    const message = error instanceof Error ? error.message : "プランの取得に失敗しました";
    console.error("[api/planning] GET失敗:", error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

const BUCKETS: TaskBucket[] = ["quick", "focus", "deep"];

function sanitizeTasks(value: unknown): PlanTask[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item, index) => {
      const raw = item as Record<string, unknown>;
      const title = String(raw.title ?? "").trim();
      if (!title) return null;
      const bucket = BUCKETS.includes(raw.bucket as TaskBucket)
        ? (raw.bucket as TaskBucket)
        : "focus";
      const minutes = Math.min(480, Math.max(5, Math.round(Number(raw.minutes)) || 30));
      const priority = Math.min(5, Math.max(1, Math.round(Number(raw.priority)) || 3)) as Priority;
      const note = String(raw.note ?? "").trim();
      const category =
        raw.category === "work" || raw.category === "life"
          ? (raw.category as TaskCategory)
          : undefined;
      const timeHint =
        raw.timeHint === "morning" || raw.timeHint === "daytime" || raw.timeHint === "evening"
          ? raw.timeHint
          : undefined;
      // ドラッグで固定した開始時刻。"HH:MM" 以外は無視する
      const pinnedStart =
        typeof raw.pinnedStart === "string" && /^\d{2}:\d{2}$/.test(raw.pinnedStart)
          ? raw.pinnedStart
          : undefined;
      const carriedFrom =
        typeof raw.carriedFrom === "string" && /^\d{4}-\d{2}-\d{2}$/.test(raw.carriedFrom)
          ? raw.carriedFrom
          : undefined;
      const task: PlanTask = {
        id: String(raw.id ?? "").trim() || `t${Date.now().toString(36)}${index}`,
        title,
        bucket,
        minutes,
        priority,
        done: Boolean(raw.done),
        ...(category ? { category } : {}),
        ...(timeHint ? { timeHint } : {}),
        ...(pinnedStart ? { pinnedStart } : {}),
        ...(carriedFrom ? { carriedFrom } : {}),
        ...(note ? { note } : {}),
      };
      return task;
    })
    .filter((task): task is PlanTask => task !== null);
}

function sanitizeTime(value: unknown, fallback: string): string {
  const text = String(value ?? "");
  return /^\d{2}:\d{2}$/.test(text) ? text : fallback;
}

/** タスクの編集（優先度変更・並べ替え・完了トグル・稼働時間の変更）を保存する */
export async function PUT(req: NextRequest) {
  try {
    const body = (await req.json()) as Record<string, unknown>;
    const date = String(body.date ?? "") || todayJst();
    const current = await loadPlan(date);

    const next: DailyPlan = {
      ...current,
      tasks: body.tasks === undefined ? current.tasks : sanitizeTasks(body.tasks),
      windows: current.windows,
      workStart: sanitizeTime(body.workStart, current.workStart),
      workEnd: sanitizeTime(body.workEnd, current.workEnd),
      breakStart: sanitizeTime(body.breakStart, current.breakStart),
      breakEnd: sanitizeTime(body.breakEnd, current.breakEnd),
    };

    // タスクが消えた場合、対応するブロックも残さない
    const taskIds = new Set(next.tasks.map((t) => t.id));
    next.blocks = next.blocks.filter((block) => taskIds.has(block.taskId));

    const saved = await savePlan(next);
    return NextResponse.json(withSummary(saved));
  } catch (error) {
    const message = error instanceof Error ? error.message : "プランの保存に失敗しました";
    console.error("[api/planning] PUT失敗:", error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
