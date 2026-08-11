import { NextRequest, NextResponse } from "next/server";
import { loadPerformance, savePerformance } from "@/app/lib/note/research/store";
import { PerformanceSnapshot } from "@/app/lib/content/monetization/types";

export const dynamic = "force-dynamic";

/** GET: PerformanceSnapshot一覧（手入力中心。APIが無くても必ず動作する） */
export async function GET(): Promise<NextResponse> {
  try {
    const file = await loadPerformance();
    return NextResponse.json({ snapshots: file.snapshots ?? [] });
  } catch (error) {
    console.error("[api/content/performance] GET失敗:", error);
    return NextResponse.json({ error: "Performanceの取得に失敗しました" }, { status: 500 });
  }
}

/**
 * POST { publishedContentId, ...metrics, source? }
 * 取得できない値は送らない/nullのままにする（0を推測して埋めない）。
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const body = await req.json();
    const publishedContentId = String(body.publishedContentId ?? "");
    if (!publishedContentId) {
      return NextResponse.json({ error: "publishedContentIdが必要です" }, { status: 400 });
    }

    const snapshot: PerformanceSnapshot = {
      id: `snap_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`,
      publishedContentId,
      capturedAt: new Date().toISOString(),
      impressions: body.impressions ?? null,
      views: body.views ?? null,
      likes: body.likes ?? null,
      comments: body.comments ?? null,
      replies: body.replies ?? null,
      reposts: body.reposts ?? null,
      bookmarks: body.bookmarks ?? null,
      profileVisits: body.profileVisits ?? null,
      follows: body.follows ?? null,
      linkClicks: body.linkClicks ?? null,
      ctaClicks: body.ctaClicks ?? null,
      paidPurchases: body.paidPurchases ?? null,
      affiliateClicks: body.affiliateClicks ?? null,
      conversions: body.conversions ?? null,
      revenue: body.revenue ?? null,
      currency: body.currency,
      source: body.source ?? "manual",
      notes: body.notes,
    };

    const file = await loadPerformance();
    const snapshots = [snapshot, ...(file.snapshots ?? [])];
    await savePerformance({ ...file, snapshots });
    return NextResponse.json({ snapshot, snapshots });
  } catch (error) {
    console.error("[api/content/performance] POST失敗:", error);
    return NextResponse.json({ error: "Performanceの記録に失敗しました" }, { status: 500 });
  }
}
