import { NextResponse } from "next/server";
import { loadPerformance, loadPublishedContent } from "@/app/lib/note/research/store";
import { loadLedger } from "@/app/lib/content/monetization/store";
import { revenueByContent, revenueByOffer, weeklyReviewSummary } from "@/app/lib/content/monetization/metrics";
import { loadLearnings } from "@/app/lib/content/learning/store";

export const dynamic = "force-dynamic";

/**
 * GET: Weekly Review用の集計。データが無ければ needsMoreData=true とし、
 * 「データ不足」の判定をUI側が正しく表示できるようにする（数値を捏造しない）。
 */
export async function GET(): Promise<NextResponse> {
  try {
    const [published, performance, ledger, learnings] = await Promise.all([
      loadPublishedContent(),
      loadPerformance(),
      loadLedger(),
      loadLearnings(),
    ]);
    const snapshots = performance.snapshots ?? [];
    const summary = weeklyReviewSummary(published, snapshots, ledger.revenueEvents);

    const byContent = revenueByContent(ledger.revenueEvents);
    const byOffer = revenueByOffer(ledger.revenueEvents);
    const topContent = [...byContent.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
    const topOffer = [...byOffer.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);

    return NextResponse.json({
      summary,
      topContent: topContent.map(([contentId, revenue]) => ({ contentId, revenue })),
      topOffer: topOffer.map(([offerId, revenue]) => ({ offerId, revenue })),
      pendingLearnings: learnings.filter((l) => l.status === "candidate").length,
    });
  } catch (error) {
    console.error("[api/content/weekly-review] GET失敗:", error);
    return NextResponse.json({ error: "Weekly Reviewの取得に失敗しました" }, { status: 500 });
  }
}
