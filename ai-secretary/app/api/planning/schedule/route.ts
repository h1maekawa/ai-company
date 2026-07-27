import { NextRequest, NextResponse } from "next/server";
import { buildSchedule, buildSuggestions } from "@/app/lib/planning/schedule";
import { loadPlan, savePlan } from "@/app/lib/planning/store";
import { loadTemplate } from "@/app/lib/planning/template";
import { summarizePlan, todayJst, nowJst, windowsForDate } from "@/app/lib/planning/types";
import { isCalendarConfigured } from "@/app/lib/planning/calendar";

/** 優先順位 × 所要時間 から今日のタイムブロッキングを生成して保存する */
export async function POST(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => ({}))) as {
      date?: unknown;
      fromNow?: unknown;
    };
    const date = String(body.date ?? "") || todayJst();
    const plan = await loadPlan(date);

    if (plan.tasks.filter((t) => !t.done).length === 0) {
      return NextResponse.json(
        { error: "未完了のタスクがありません。先に今日やることを入力してください。" },
        { status: 422 }
      );
    }

    // その日の枠をテンプレートから解決し、プランにスナップショットとして持たせる
    const template = await loadTemplate();
    const windows = windowsForDate(template, date);
    const planWithWindows = { ...plan, windows };

    // 「今から詰め直す」場合は現在時刻を開始位置にする
    const from = body.fromNow ? nowJst() : undefined;
    const { blocks, overflow } = buildSchedule(planWithWindows, from);
    const saved = await savePlan({ ...planWithWindows, blocks });
    const suggestions = await buildSuggestions(saved, overflow, windows);

    return NextResponse.json({
      plan: saved,
      summary: summarizePlan(saved, nowJst()),
      calendarConfigured: isCalendarConfigured(),
      overflow,
      suggestions,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "スケジュールの生成に失敗しました";
    console.error("[api/planning/schedule] 失敗:", error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
