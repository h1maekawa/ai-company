import { NextRequest, NextResponse } from "next/server";
import { classifyTasks } from "@/app/lib/planning/classify";
import { loadPlan, savePlan } from "@/app/lib/planning/store";
import { summarizePlan, todayJst, nowJst } from "@/app/lib/planning/types";
import { isCalendarConfigured } from "@/app/lib/planning/calendar";

/**
 * 朝会の入力を動詞ベースのタスクへ変換し、その日のプランへ追記する。
 * （既存タスクは消さない。朝会を分けて2回やる日もあるため）
 */
export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as { text?: unknown; date?: unknown };
    const text = String(body.text ?? "").trim();
    const date = String(body.date ?? "") || todayJst();

    if (!text) {
      return NextResponse.json({ error: "今日やることを入力してください" }, { status: 400 });
    }

    const classified = await classifyTasks(text);
    if (classified.length === 0) {
      return NextResponse.json(
        { error: "タスクを読み取れませんでした。動詞ベースで書き直してみてください。" },
        { status: 422 }
      );
    }

    const current = await loadPlan(date);
    const saved = await savePlan({ ...current, tasks: [...current.tasks, ...classified] });

    return NextResponse.json({
      plan: saved,
      summary: summarizePlan(saved, nowJst()),
      calendarConfigured: isCalendarConfigured(),
      added: classified.length,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "タスクの分類に失敗しました";
    console.error("[api/planning/classify] 失敗:", error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
