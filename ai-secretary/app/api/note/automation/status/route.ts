import { NextResponse } from "next/server";
import { getAutomationStatus } from "@/app/lib/note/automation/status";
import { isSerpApiConfigured } from "@/app/lib/note/research/serpapi";
import { isBufferConfigured } from "@/app/lib/note/publishing/buffer";
import { loadResearchSettings } from "@/app/lib/note/research/store";
import { loadPortfolio } from "@/app/lib/investing/portfolio";
import { loadNews } from "@/app/lib/investing/news";

export const dynamic = "force-dynamic";

/**
 * GET /api/note/automation/status
 *
 * 完全自律SNS事業部の「接続状態」と「運用の現況」を1本で返す読み取り専用API。
 * どの設定も変更しない。
 *
 * 消費側が2つあるため、両方のフィールドを揃えて返す:
 *   - AutomationSettings … buffer / serpApi / xResearch / investing の接続確認
 *   - AutomationMonitor  … mode / blockers / today / approvalQueue の監視表示
 */
export async function GET(): Promise<NextResponse> {
  try {
    const [status, settings, portfolio] = await Promise.all([
      getAutomationStatus(),
      loadResearchSettings(),
      loadPortfolio(),
    ]);

    const tickers = portfolio.positions
      .filter((p) => p.assetClass === "us_stock")
      .map((p) => p.code.toUpperCase());
    const news = await loadNews(tickers).catch(() => ({ available: false }));

    return NextResponse.json({
      ...status,
      buffer: { configured: isBufferConfigured() },
      serpApi: { configured: isSerpApiConfigured() },
      xResearch: { enabled: settings.x.enabled, mode: settings.x.mode },
      investing: {
        portfolioAvailable: portfolio.source !== "none",
        newsAvailable: news.available,
      },
      performanceSync: { lastRunAt: status.recent.lastSyncedAt },
    });
  } catch (error) {
    console.error("[api/note/automation/status] 失敗:", error);
    return NextResponse.json({ error: "運用状況の取得に失敗しました" }, { status: 500 });
  }
}
