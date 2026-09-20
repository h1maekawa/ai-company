import { NextResponse } from "next/server";
import { loadHoldings } from "@/app/lib/fund/store";
import { projectInvestmentAccounting, buildInvestmentPerformance } from "@/app/lib/fund/transactions/accounting";
import { loadInvestmentTransactions } from "@/app/lib/fund/transactions/store";

export const dynamic = "force-dynamic";

export async function GET(): Promise<NextResponse> {
  try {
    const [transactions, holdings] = await Promise.all([loadInvestmentTransactions(), loadHoldings()]);
    const accounting = projectInvestmentAccounting(transactions);
    return NextResponse.json({ success: true, performance: buildInvestmentPerformance(accounting, holdings) });
  } catch (error) {
    console.error("[Fund Performance API] Error:", error);
    return NextResponse.json({ error: "Investment Performanceの取得に失敗しました" }, { status: 500 });
  }
}
