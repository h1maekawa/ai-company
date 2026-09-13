import { NextResponse } from "next/server";
import { getExecutionStore, loadExecutionState } from "@/app/lib/company/execution/store";
import { runtimeHealth } from "@/app/lib/company/runtime/operations";
import {
  agentPerformance,
  safeRevenueContributions,
} from "@/app/lib/company/execution/performance";
import { loadRevenueEntries } from "@/app/lib/company/revenueStore";
import { loadOpportunities } from "@/app/lib/company/opportunity/store";
export const dynamic = "force-dynamic";
export async function GET() {
  try {
    const [state, revenue, opportunities, runtime] = await Promise.all([
      loadExecutionState(),
      loadRevenueEntries(),
      loadOpportunities(),
      runtimeHealth(getExecutionStore()),
    ]);
    return NextResponse.json({
      state,
      revenue,
      opportunities,
      performance: agentPerformance(state, revenue),
      contributions: safeRevenueContributions(revenue, state),
      runtime,
    });
  } catch {
    return NextResponse.json(
      { error: "実行履歴を取得できませんでした" },
      { status: 500 },
    );
  }
}
