import { NextResponse } from "next/server";
import { loadPortfolio } from "@/app/lib/investing/portfolio";
import { loadNews } from "@/app/lib/investing/news";

export const dynamic = "force-dynamic";

/**
 * GET /api/investing/news
 * 保有銘柄に関する実際のニュース見出し（+AI要約）を返す。
 * フィードに到達できない環境では available:false を返し、UIは「未取得」を表示する。
 */
export async function GET(): Promise<NextResponse> {
  try {
    const portfolio = await loadPortfolio();
    const tickers = portfolio.positions
      .filter((p) => p.assetClass === "us_stock")
      .map((p) => p.code.toUpperCase());

    const news = await loadNews(tickers);
    return NextResponse.json({ ...news, tickers });
  } catch (error) {
    const message = error instanceof Error ? error.message : "ニュースの取得に失敗しました";
    console.error("[api/investing/news] 失敗:", error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
