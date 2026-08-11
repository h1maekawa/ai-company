import { NextRequest, NextResponse } from "next/server";
import { loadPerformance } from "@/app/lib/note/research/store";
import { loadLedger } from "@/app/lib/content/monetization/store";
import { buildFunnel, latestSnapshotByContent, totalRevenue } from "@/app/lib/content/monetization/metrics";

export const dynamic = "force-dynamic";

/** GET ?publishedContentId=xxx: X impressions→Link→note views→CTA→Purchase→RevenueのFunnel */
export async function GET(req: NextRequest): Promise<NextResponse> {
  try {
    const publishedContentId = req.nextUrl.searchParams.get("publishedContentId");
    if (!publishedContentId) {
      return NextResponse.json({ error: "publishedContentIdが必要です" }, { status: 400 });
    }

    const [performance, ledger] = await Promise.all([loadPerformance(), loadLedger()]);
    const snapshots = performance.snapshots ?? [];
    const latest = latestSnapshotByContent(snapshots).get(publishedContentId);
    const events = ledger.revenueEvents.filter((r) => r.publishedContentId === publishedContentId);
    const purchases = ledger.conversions.filter(
      (c) => c.publishedContentId === publishedContentId && c.eventType === "purchase"
    ).length;

    const funnel = buildFunnel({
      impressions: latest?.impressions,
      linkClicks: latest?.linkClicks,
      noteViews: latest?.views,
      ctaClicks: latest?.ctaClicks,
      purchases: purchases || latest?.paidPurchases,
      revenue: events.length > 0 ? totalRevenue(events) : latest?.revenue,
    });

    return NextResponse.json({ funnel });
  } catch (error) {
    console.error("[api/content/funnel] GET失敗:", error);
    return NextResponse.json({ error: "Funnelの取得に失敗しました" }, { status: 500 });
  }
}
