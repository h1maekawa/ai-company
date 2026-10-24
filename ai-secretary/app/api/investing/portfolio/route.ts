import { NextResponse } from "next/server";
import { loadPortfolio } from "@/app/lib/investing/portfolio";
import { computeTodayChange, loadHistory } from "@/app/lib/investing/history";

// 保有状況はリクエストごとにVaultから読む
export const dynamic = "force-dynamic";

/**
 * GET /api/investing/portfolio
 * 保有ポートフォリオ・サマリー・資産推移履歴を返す。
 * GETはVaultの読み取りのみ。スナップショット記録は明示的なcron writerが担う。
 */
export async function GET(): Promise<NextResponse> {
  try {
    const portfolio = await loadPortfolio();
    const history = await loadHistory();
    const { todayPnlJpy, todayPnlPct } = computeTodayChange(history);

    return NextResponse.json({
      ...portfolio,
      summary: { ...portfolio.summary, todayPnlJpy, todayPnlPct },
      history,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "ポートフォリオの取得に失敗しました";
    console.error("[api/investing/portfolio] 失敗:", error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
