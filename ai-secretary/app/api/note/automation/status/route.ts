import { NextResponse } from "next/server";
import { loadPerformance, loadResearchSettings } from "@/app/lib/note/research/store";
import { isBufferConfigured } from "@/app/lib/note/publishing/buffer";
import { loadPortfolio } from "@/app/lib/investing/portfolio";
import { loadNews } from "@/app/lib/investing/news";

export const dynamic = "force-dynamic";

/**
 * GET /api/note/automation/status
 * 完全自律SNS事業部の接続状態を人間が本番投入前に確認するための読み取り専用API。
 * どの設定も変更しない。
 */
export async function GET(): Promise<NextResponse> {
  try {
    const [settings, portfolio, performance] = await Promise.all([
      loadResearchSettings(),
      loadPortfolio(),
      loadPerformance(),
    ]);
    const tickers = portfolio.positions
      .filter((p) => p.assetClass === "us_stock")
      .map((p) => p.code.toUpperCase());
    const news = await loadNews(tickers).catch(() => ({ available: false }));
    const lastMeasuredAt = performance.records
      .map((r) => r.measuredAt)
      .sort()
      .at(-1);

    return NextResponse.json({
      mode: settings.flags.socialOperationMode,
      buffer: { configured: isBufferConfigured() },
      xResearch: { enabled: settings.x.enabled, mode: settings.x.mode },
      investing: {
        portfolioAvailable: portfolio.source !== "none",
        newsAvailable: news.available,
      },
      performanceSync: { lastRunAt: lastMeasuredAt ?? null },
    });
  } catch (error) {
    console.error("[api/note/automation/status] 失敗:", error);
    return NextResponse.json({ error: "接続状態の取得に失敗しました" }, { status: 500 });
  }
}
