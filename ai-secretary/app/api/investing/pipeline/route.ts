import { NextResponse } from "next/server";
import { loadOpportunityPipeline } from "@/app/lib/investing/opportunityPipeline/loader";

export const dynamic = "force-dynamic";

/**
 * GET /api/investing/pipeline
 * Opportunity Pipeline（PR-D）: 既存watchlist.mdを、今日のHorizon/Triple Gateでadditiveに
 * projectionする。Read-only。watchlist/portfolioを変更しない。発注・売買は行わない。
 */
export async function GET(): Promise<NextResponse> {
  try {
    return NextResponse.json({ items: await loadOpportunityPipeline() });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Opportunity Pipelineの取得に失敗しました";
    console.error("[api/investing/pipeline] 失敗:", error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
