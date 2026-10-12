import { NextResponse } from "next/server";
import { loadInvestmentLearningReport } from "@/app/lib/investing/intelligence/learning/loader";

export const dynamic = "force-dynamic";

/**
 * GET /api/investing/decisions/learning
 * Investment Learning（PR-E）: HorizonFactor（PR-C）とDecision Performanceの相関からFactor
 * PerformanceとLearning Candidateを返す。Weightは一切書き込まない（requiresHumanReview:true）。
 * 既存の /api/investing/learning（note/X向けLearning Brief）とは別物。
 */
export async function GET(): Promise<NextResponse> {
  try {
    return NextResponse.json(await loadInvestmentLearningReport());
  } catch (error) {
    const message = error instanceof Error ? error.message : "Investment Learningの取得に失敗しました";
    console.error("[api/investing/decisions/learning] 失敗:", error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
