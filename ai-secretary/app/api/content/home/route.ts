import { NextResponse } from "next/server";
import { loadPerformance, loadPublishedContent } from "@/app/lib/note/research/store";
import { loadLedger } from "@/app/lib/content/monetization/store";
import { filterByPeriod, totalRevenue } from "@/app/lib/content/monetization/metrics";
import { loadRecommendations } from "@/app/lib/content/learning/store";
import { loadSessions } from "@/app/lib/content/note-studio/store";

export const dynamic = "force-dynamic";

/**
 * GET: Content Home（「今何をすればいいか」ダッシュボード）の集計。
 * Next Actionは決定的なルールで組み立てる（AIの自由生成ではない）。
 */
export async function GET(): Promise<NextResponse> {
  try {
    const [published, performance, ledger, recommendations, sessions] = await Promise.all([
      loadPublishedContent(),
      loadPerformance(),
      loadLedger(),
      loadRecommendations(),
      loadSessions(),
    ]);

    const weekPublished = filterByPeriod(
      published.map((p) => ({ ...p, occurredAt: p.publishedAt })),
      "week"
    );
    const weekRevenueEvents = filterByPeriod(ledger.revenueEvents, "week");

    const snapshots = performance.snapshots ?? [];
    const measuredContentIds = new Set(snapshots.map((s) => s.publishedContentId));
    const unmeasured = published.filter((p) => !measuredContentIds.has(p.id)).slice(0, 5);

    const nextActions: { label: string; href?: string }[] = [];
    if (unmeasured.length > 0) {
      nextActions.push({ label: `${unmeasured[0].title} の結果を入力`, href: "/content/performance" });
    }
    const pendingRecommendations = recommendations.filter((r) => r.status === "suggested");
    if (pendingRecommendations.length > 0) {
      nextActions.push({ label: `次の記事候補「${pendingRecommendations[0].topic}」を確認`, href: "/content/learnings" });
    }
    const draftSessions = sessions.filter((s) => s.stage !== "PUBLISHED");
    if (draftSessions.length > 0) {
      nextActions.push({ label: `作成中の記事「${draftSessions[0].title}」を続ける`, href: "/content/note" });
    }

    return NextResponse.json({
      week: {
        publishedCount: weekPublished.length,
        revenue: totalRevenue(weekRevenueEvents),
        conversions: weekRevenueEvents.length,
      },
      nextActions,
      pendingRecommendations: pendingRecommendations.length,
      draftSessions: draftSessions.length,
    });
  } catch (error) {
    console.error("[api/content/home] GET失敗:", error);
    return NextResponse.json({ error: "Content Homeの取得に失敗しました" }, { status: 500 });
  }
}
