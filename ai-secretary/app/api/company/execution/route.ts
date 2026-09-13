import { NextResponse } from "next/server";
import { loadExecutionState } from "@/app/lib/company/execution/store";
import {
  agentPerformance,
  safeRevenueContributions,
} from "@/app/lib/company/execution/performance";
import { loadRevenueEntries } from "@/app/lib/company/revenueStore";
import { loadOpportunities } from "@/app/lib/company/opportunity/store";
export const dynamic = "force-dynamic";
export async function GET() {
  try {
    const [state, revenue, opportunities] = await Promise.all([
      loadExecutionState(),
      loadRevenueEntries(),
      loadOpportunities(),
    ]);
    return NextResponse.json({
      state,
      revenue,
      opportunities,
      performance: agentPerformance(state, revenue),
      contributions: safeRevenueContributions(revenue, state),
    });
  } catch {
    return NextResponse.json(
      { error: "実行履歴を取得できませんでした" },
      { status: 500 },
    );
  }
}
