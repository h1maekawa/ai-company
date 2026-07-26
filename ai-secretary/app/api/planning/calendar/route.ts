import { NextRequest, NextResponse } from "next/server";
import { buildIcs, isCalendarConfigured, syncPlanToCalendar } from "@/app/lib/planning/calendar";
import { loadPlan, savePlan } from "@/app/lib/planning/store";
import { summarizePlan, todayJst, nowJst } from "@/app/lib/planning/types";

// リクエストごとにVault/環境変数を読むため静的化しない
export const dynamic = "force-dynamic";

/** Googleカレンダー未設定でも使えるように、ICSファイルとしても書き出せる */
export async function GET(req: NextRequest) {
  try {
    const date = req.nextUrl.searchParams.get("date") || todayJst();
    const plan = await loadPlan(date);
    if (plan.blocks.length === 0) {
      return NextResponse.json({ error: "先に時間割を生成してください" }, { status: 422 });
    }
    return new NextResponse(buildIcs(plan), {
      headers: {
        "Content-Type": "text/calendar; charset=utf-8",
        "Content-Disposition": `attachment; filename="ai-company-${date}.ics"`,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "ICSの生成に失敗しました";
    console.error("[api/planning/calendar] GET失敗:", error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/** 今日のタイムブロッキングをGoogleカレンダーへ反映する（作り直し方式） */
export async function POST(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => ({}))) as { date?: unknown };
    const date = String(body.date ?? "") || todayJst();

    if (!isCalendarConfigured()) {
      return NextResponse.json(
        {
          error:
            "Googleカレンダー連携が未設定です。GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET / GOOGLE_REFRESH_TOKEN を設定するか、ICSダウンロードをお使いください。",
          needsSetup: true,
        },
        { status: 400 }
      );
    }

    const plan = await loadPlan(date);
    if (plan.blocks.length === 0) {
      return NextResponse.json({ error: "先に時間割を生成してください" }, { status: 422 });
    }

    const result = await syncPlanToCalendar(plan);
    const saved = await savePlan({ ...plan, syncedAt: new Date().toISOString() });

    return NextResponse.json({
      plan: saved,
      summary: summarizePlan(saved, nowJst()),
      calendarConfigured: true,
      result,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "カレンダー同期に失敗しました";
    console.error("[api/planning/calendar] POST失敗:", error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
