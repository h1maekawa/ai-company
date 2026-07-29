import { NextResponse } from "next/server";
import { loadPortfolio } from "@/app/lib/investing/portfolio";
import { computeTodayChange, recordSnapshot } from "@/app/lib/investing/history";
import { loadCapacity } from "@/app/lib/investing/capacity";

// 保有状況はリクエストごとにVaultから読む
export const dynamic = "force-dynamic";

/**
 * GET /api/investing/portfolio
 * 保有ポートフォリオ・サマリー・資産推移履歴を返す。
 * 併せて当日の総評価額をスナップショットとして記録する（1日1点）。
 */
export async function GET(): Promise<NextResponse> {
  try {
    const portfolio = await loadPortfolio();
    const history = await recordSnapshot(portfolio.summary.totalValueJpy);
    const { todayPnlJpy, todayPnlPct } = computeTodayChange(history);

    // 現金残高は家計簿の口座残高を正とする。
    // 保存は capacity API 側に任せる（同時書き込みでSHAが競合するため）
    const capacity = await loadCapacity(undefined, { persist: false });
    const cashJpy = capacity?.available_cash ?? portfolio.summary.cashJpy;

    return NextResponse.json({
      ...portfolio,
      summary: { ...portfolio.summary, cashJpy, todayPnlJpy, todayPnlPct },
      history,
      capacity,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "ポートフォリオの取得に失敗しました";
    console.error("[api/investing/portfolio] 失敗:", error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
