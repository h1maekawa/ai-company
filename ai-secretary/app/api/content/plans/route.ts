import { NextRequest, NextResponse } from "next/server";
import { createContentPlan } from "@/app/lib/content/learning/types";
import { loadContentPlans, saveContentPlans } from "@/app/lib/content/learning/store";

export const dynamic = "force-dynamic";

export async function GET(): Promise<NextResponse> {
  try {
    return NextResponse.json({ plans: await loadContentPlans() });
  } catch (error) {
    console.error("[api/content/plans] GET失敗:", error);
    return NextResponse.json({ error: "Content Planの取得に失敗しました" }, { status: 500 });
  }
}

/** POST: 新規ContentPlan（Timeboxへの追加は含まない。追加は別のoptional action） */
export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const body = await req.json();
    if (!body.channel || !body.topic) {
      return NextResponse.json({ error: "channel と topic が必要です" }, { status: 400 });
    }
    const plan = createContentPlan({
      channel: body.channel,
      topic: body.topic,
      goal: body.goal,
      offerId: body.offerId,
      plannedDate: body.plannedDate,
    });
    const existing = await loadContentPlans();
    const plans = await saveContentPlans([plan, ...existing]);
    return NextResponse.json({ plan, plans });
  } catch (error) {
    console.error("[api/content/plans] POST失敗:", error);
    return NextResponse.json({ error: "Content Planの作成に失敗しました" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest): Promise<NextResponse> {
  try {
    const body = await req.json();
    const id = String(body.id ?? "");
    if (!id) return NextResponse.json({ error: "idが必要です" }, { status: 400 });
    const existing = await loadContentPlans();
    const plans = await saveContentPlans(
      existing.map((p) => (p.id === id ? { ...p, ...body.patch, id: p.id, updatedAt: new Date().toISOString() } : p))
    );
    return NextResponse.json({ plans });
  } catch (error) {
    console.error("[api/content/plans] PATCH失敗:", error);
    return NextResponse.json({ error: "Content Planの更新に失敗しました" }, { status: 500 });
  }
}
