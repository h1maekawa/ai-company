import { NextRequest, NextResponse } from "next/server";
import { createArticleSession } from "@/app/lib/content/note-studio/types";
import { saveSession } from "@/app/lib/content/note-studio/store";
import { loadRecommendations, saveRecommendations } from "@/app/lib/content/learning/store";

export const dynamic = "force-dynamic";

/**
 * POST: Recommendationを採用（selected）し、ArticleSession（またはX Draftの元Material）を作る。
 * Performance → Learning → Recommendation → Next Content のLoopを閉じる。
 */
export async function POST(
  _req: NextRequest,
  { params }: { params: { id: string } }
): Promise<NextResponse> {
  try {
    const recommendations = await loadRecommendations();
    const target = recommendations.find((r) => r.id === params.id);
    if (!target) return NextResponse.json({ error: "Recommendationが見つかりません" }, { status: 404 });

    const session = createArticleSession({ title: target.topic });
    session.angle = target.angle;
    session.contentGoal = target.contentGoal;
    if (target.recommendedOfferId) session.offerIds = [target.recommendedOfferId];
    await saveSession(session);

    const updated = { ...target, status: "converted" as const, convertedToId: session.id };
    await saveRecommendations(recommendations.map((r) => (r.id === target.id ? updated : r)));

    return NextResponse.json({ recommendation: updated, session });
  } catch (error) {
    console.error("[api/content/recommendations/:id/convert] POST失敗:", error);
    return NextResponse.json({ error: "Recommendationの採用に失敗しました" }, { status: 500 });
  }
}
