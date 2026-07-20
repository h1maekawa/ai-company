import { NextResponse } from "next/server";
import {
  loadDecisions,
  loadRecommendations,
} from "@/app/lib/fund/store";

/**
 * GET /api/fund/reviews — 振り返り用データ。
 * 本人判断ログと対応するAI提案を突き合わせて返す（§15, §16）。
 * 1週間/1か月/3か月/6か月後の結果記録はPhase 3で拡張する。
 */
export async function GET(): Promise<NextResponse> {
  try {
    const [decisions, recommendations] = await Promise.all([
      loadDecisions(),
      loadRecommendations(),
    ]);

    const recById = new Map(recommendations.map((r) => [r.id, r]));
    const reviews = decisions.map((d) => ({
      decision: d,
      recommendation: d.recommendationId
        ? (recById.get(d.recommendationId) ?? null)
        : null,
    }));

    return NextResponse.json({
      success: true,
      reviews,
      counts: {
        decisions: decisions.length,
        recommendations: recommendations.length,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
