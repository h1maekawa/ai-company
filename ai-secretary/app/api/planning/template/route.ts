import { NextRequest, NextResponse } from "next/server";
import { loadTemplate, saveTemplate } from "@/app/lib/planning/template";
import { TimeWindow, WEEKDAY_LABELS, windowCapacity } from "@/app/lib/planning/types";

export const dynamic = "force-dynamic";

function withCapacity(days: TimeWindow[][]) {
  return days.map((windows, weekday) => ({
    weekday,
    label: WEEKDAY_LABELS[weekday],
    windows,
    capacity: windowCapacity(windows),
  }));
}

/** GET /api/planning/template — 曜日別の仕事枠／プライベート枠 */
export async function GET(): Promise<NextResponse> {
  try {
    const template = await loadTemplate();
    return NextResponse.json({ template, days: withCapacity(template.days) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "テンプレートの取得に失敗しました";
    console.error("[api/planning/template] GET失敗:", error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/** PUT /api/planning/template — 枠を丸ごと保存する */
export async function PUT(req: NextRequest): Promise<NextResponse> {
  try {
    const body = (await req.json()) as { days?: unknown };
    if (!Array.isArray(body.days) || body.days.length !== 7) {
      return NextResponse.json(
        { error: "days は日〜土の7要素の配列で送ってください" },
        { status: 400 }
      );
    }
    const template = await saveTemplate(body.days as TimeWindow[][]);
    return NextResponse.json({ template, days: withCapacity(template.days) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "テンプレートの保存に失敗しました";
    console.error("[api/planning/template] PUT失敗:", error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
