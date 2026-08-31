import { NextResponse } from "next/server";
import { getOrCreateTodayLearningBrief, loadRecentLearningBriefs } from "@/app/lib/note/investing/learningBrief";

export const dynamic = "force-dynamic";

/**
 * GET /api/investing/learning
 * 今日のInvestment Learning Briefを返す（無ければ生成する）。
 * 新しい材料が無い日はbrief:nullを返し、UIは「本日はスキップ」を表示する。
 */
export async function GET(): Promise<NextResponse> {
  try {
    const [brief, recent] = await Promise.all([
      getOrCreateTodayLearningBrief(),
      loadRecentLearningBriefs(7),
    ]);
    return NextResponse.json({ brief, recent });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Learning Briefの取得に失敗しました";
    console.error("[api/investing/learning] 失敗:", error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
