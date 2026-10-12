import { NextResponse } from "next/server";
import { loadPortfolioRiskReport } from "@/app/lib/investing/portfolioRisk/loader";

export const dynamic = "force-dynamic";

/**
 * GET /api/investing/portfolio/risk
 * Portfolio Intelligence（PR-D）: Theme/Sector/Single Stock/Country/Currency/Correlation/
 * Drawdown/Thesis Riskの8 dimensionを返す。Read-only。Portfolioを変更しない。
 */
export async function GET(): Promise<NextResponse> {
  try {
    return NextResponse.json(await loadPortfolioRiskReport());
  } catch (error) {
    const message = error instanceof Error ? error.message : "Portfolio Riskの取得に失敗しました";
    console.error("[api/investing/portfolio/risk] 失敗:", error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
