import { NextRequest, NextResponse } from "next/server";
import { generateRecommendationsFromLearnings } from "@/app/lib/content/learning/engine";
import { loadLearnings, loadRecommendations, saveRecommendations } from "@/app/lib/content/learning/store";

export const dynamic = "force-dynamic";

export async function GET(): Promise<NextResponse> {
  try {
    return NextResponse.json({ recommendations: await loadRecommendations() });
  } catch (error) {
    console.error("[api/content/recommendations] GET失敗:", error);
    return NextResponse.json({ error: "Recommendationの取得に失敗しました" }, { status: 500 });
  }
}

/**
 * POST { action: "generate" }: 承認済みLearningから機械的に候補を作る
 * POST { action: "create", ...fields }: 手動作成
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const body = await req.json();
    const existing = await loadRecommendations();

    if (body.action === "generate") {
      const learnings = await loadLearnings();
      const generated = generateRecommendationsFromLearnings(learnings, {
        channel: body.channel,
        contentGoal: body.contentGoal,
      });
      const recommendations = await saveRecommendations([...generated, ...existing]);
      return NextResponse.json({ generated, recommendations });
    }

    return NextResponse.json({ error: "actionを指定してください" }, { status: 400 });
  } catch (error) {
    console.error("[api/content/recommendations] POST失敗:", error);
    return NextResponse.json({ error: "Recommendationの作成に失敗しました" }, { status: 500 });
  }
}

/** PATCH { id, status: "selected"|"rejected" } */
export async function PATCH(req: NextRequest): Promise<NextResponse> {
  try {
    const body = await req.json();
    const id = String(body.id ?? "");
    const status = body.status;
    if (!id || !["selected", "rejected"].includes(status)) {
      return NextResponse.json({ error: "id と有効な status が必要です" }, { status: 400 });
    }
    const existing = await loadRecommendations();
    const recommendations = await saveRecommendations(existing.map((r) => (r.id === id ? { ...r, status } : r)));
    return NextResponse.json({ recommendations });
  } catch (error) {
    console.error("[api/content/recommendations] PATCH失敗:", error);
    return NextResponse.json({ error: "Recommendationの更新に失敗しました" }, { status: 500 });
  }
}
