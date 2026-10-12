import { NextResponse } from "next/server";
import { loadDecisionPerformanceReport } from "@/app/lib/investing/intelligence/decisionPerformance/loader";

export const dynamic = "force-dynamic";

/**
 * GET /api/investing/decisions/performance
 * Decision Performance（PR-E）: 既存Decision Store（InvestmentDecisionRecord）をreuseし、
 * GO/WAIT/PASSそれぞれのその後のreturn/drawdown/gainを計測する。Read-only。
 */
export async function GET(): Promise<NextResponse> {
  try {
    return NextResponse.json(await loadDecisionPerformanceReport());
  } catch (error) {
    const message = error instanceof Error ? error.message : "Decision Performanceの取得に失敗しました";
    console.error("[api/investing/decisions/performance] 失敗:", error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
