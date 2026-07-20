import { NextRequest, NextResponse } from "next/server";
import { loadPolicy, loadHoldings } from "@/app/lib/fund/store";
import {
  buildUniverse,
  screenTicker,
  rankResults,
  analystConfig,
} from "@/app/lib/fund/analyst";
import { getProvider } from "@/app/lib/fund/marketData/provider";

export const maxDuration = 60;

/**
 * GET /api/fund/scan — Fund Analyst 一次抽出
 * ユニバース（保有＋テーマ＋監視銘柄）を巡回し、「今日見るべき銘柄」ランキングを返す。
 * ?tickers=NVDA,MU で対象を上書き可能。
 * 購入判断は行わない。詳細評価は /api/fund/evaluate（Policy Engine）へ。
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const [{ policy }, holdingsData] = await Promise.all([
      loadPolicy(),
      loadHoldings(),
    ]);
    const holdings = holdingsData?.holdings ?? [];

    const override = request.nextUrl.searchParams.get("tickers");
    const universe = override
      ? override
          .split(",")
          .map((t) => t.trim().toUpperCase())
          .filter(Boolean)
      : buildUniverse(policy, holdings);

    const provider = getProvider();

    // 順次取得（キャッシュ有効・Stooqへの同時大量リクエストを避ける）
    const results = [];
    for (const ticker of universe) {
      const bars = await provider.getDailyBars(ticker, 21);
      results.push(screenTicker(ticker, bars, policy));
    }

    const ranked = rankResults(results, policy, holdings);
    const cfg = analystConfig(policy);

    return NextResponse.json({
      success: true,
      scannedAt: new Date().toISOString(),
      universeSize: universe.length,
      topN: cfg.topN,
      results: ranked,
      provider: provider.name,
      note: "一次抽出のみ。購入判断はPolicy Engine（評価フォーム）で行う",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("[Fund Scan API] Error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
