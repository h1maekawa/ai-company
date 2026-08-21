import { NextRequest, NextResponse } from "next/server";
import { loadPerformance, loadPublishedContent } from "@/app/lib/note/research/store";
import { loadLedger, loadOffers, loadCtaLibrary } from "@/app/lib/content/monetization/store";
import {
  deriveMetrics,
  filterByPeriod,
  latestSnapshotByContent,
  revenueByContent,
  revenueByOffer,
  revenueByType,
  totalRevenue,
} from "@/app/lib/content/monetization/metrics";

export const dynamic = "force-dynamic";

/** GET ?period=today|week|month|all: Performance/Revenue Dashboard共通の集計データ */
export async function GET(req: NextRequest): Promise<NextResponse> {
  try {
    const period = (req.nextUrl.searchParams.get("period") ?? "all") as "today" | "week" | "month" | "all";
    const [published, performance, ledger, offers, ctas] = await Promise.all([
      loadPublishedContent(),
      loadPerformance(),
      loadLedger(),
      loadOffers(),
      loadCtaLibrary(),
    ]);

    const periodPublished = filterByPeriod(published.map((p) => ({ ...p, occurredAt: p.publishedAt })), period);
    const periodRevenue = filterByPeriod(ledger.revenueEvents, period);
    const periodConversions = filterByPeriod(ledger.conversions, period);

    const snapshots = performance.snapshots ?? [];
    const latest = latestSnapshotByContent(snapshots);

    let noteViews = 0;
    let xImpressions = 0;
    let linkClicks = 0;
    let ctaClicks = 0;
    let hasNoteViews = false;
    let hasImpressions = false;
    for (const pub of periodPublished) {
      const snap = latest.get(pub.id);
      if (!snap) continue;
      if (pub.channel === "note" && typeof snap.views === "number") {
        noteViews += snap.views;
        hasNoteViews = true;
      }
      if (pub.channel === "x" && typeof snap.impressions === "number") {
        xImpressions += snap.impressions;
        hasImpressions = true;
      }
      if (typeof snap.linkClicks === "number") linkClicks += snap.linkClicks;
      if (typeof snap.ctaClicks === "number") ctaClicks += snap.ctaClicks;
    }

    const revenue = totalRevenue(periodRevenue);
    const byContent = revenueByContent(periodRevenue);
    const topContent = [...byContent.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([contentId, rev]) => ({
        contentId,
        revenue: rev,
        title: published.find((p) => p.id === contentId)?.title ?? contentId,
      }));

    const byOfferMap = revenueByOffer(periodRevenue);
    const topOffer = [...byOfferMap.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([offerId, rev]) => ({ offerId, revenue: rev, name: offers.offers.find((o) => o.id === offerId)?.name ?? offerId }));

    const derived = deriveMetrics({
      impressions: hasImpressions ? xImpressions : undefined,
      linkClicks: linkClicks || undefined,
      ctaClicks: ctaClicks || undefined,
      conversions: periodConversions.length || undefined,
      totalRevenue: revenue,
      contentCount: periodPublished.length || undefined,
    });

    return NextResponse.json({
      period,
      publishedCount: periodPublished.length,
      revenue,
      revenueByType: Object.fromEntries(revenueByType(periodRevenue)),
      conversions: periodConversions.length,
      noteViews: hasNoteViews ? noteViews : null,
      xImpressions: hasImpressions ? xImpressions : null,
      linkClicks: linkClicks || null,
      ctaClicks: ctaClicks || null,
      derived,
      topContent,
      topOffer,
      ctaCount: ctas.length,
    });
  } catch (error) {
    console.error("[api/content/dashboard] GET失敗:", error);
    return NextResponse.json({ error: "Dashboardの取得に失敗しました" }, { status: 500 });
  }
}
