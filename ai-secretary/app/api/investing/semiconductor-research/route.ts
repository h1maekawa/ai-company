import { NextResponse } from "next/server";
import { loadPortfolio } from "@/app/lib/investing/portfolio";
import { loadIntelligenceToday } from "@/app/lib/investing/intelligence/store";
import { buildSemiconductorPortfolioResearch } from "@/app/lib/investing/intelligence/semiconductorResearch";

export const dynamic = "force-dynamic";

/** Read-only join over the existing private portfolio and Investment Intelligence stores. */
export async function GET(): Promise<NextResponse> {
  try {
    const [portfolio, today] = await Promise.all([loadPortfolio(), loadIntelligenceToday()]);
    return NextResponse.json(buildSemiconductorPortfolioResearch(portfolio.positions, today));
  } catch {
    // Do not log portfolio contents or provider/store errors that could contain private data.
    return NextResponse.json({ error: "SEMICONDUCTOR_RESEARCH_UNAVAILABLE" }, { status: 503 });
  }
}
