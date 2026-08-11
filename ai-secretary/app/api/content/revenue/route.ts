import { NextRequest, NextResponse } from "next/server";
import { loadLedger, saveLedger } from "@/app/lib/content/monetization/store";
import {
  buildAttributions,
  filterByPeriod,
  revenueByContent,
  revenueByOffer,
  revenueByType,
  totalRevenue,
} from "@/app/lib/content/monetization/metrics";
import { RevenueEvent } from "@/app/lib/content/monetization/types";

export const dynamic = "force-dynamic";

/** GET ?period=today|week|month|all: Revenueの正データ・集計・Attribution */
export async function GET(req: NextRequest): Promise<NextResponse> {
  try {
    const period = (req.nextUrl.searchParams.get("period") ?? "all") as "today" | "week" | "month" | "all";
    const { revenueEvents } = await loadLedger();
    const filtered = filterByPeriod(revenueEvents, period);
    return NextResponse.json({
      revenueEvents: filtered,
      total: totalRevenue(filtered),
      byContent: Object.fromEntries(revenueByContent(filtered)),
      byOffer: Object.fromEntries(revenueByOffer(filtered)),
      byType: Object.fromEntries(revenueByType(filtered)),
      attributions: buildAttributions(filtered),
    });
  } catch (error) {
    console.error("[api/content/revenue] GET失敗:", error);
    return NextResponse.json({ error: "Revenueの取得に失敗しました" }, { status: 500 });
  }
}

/**
 * POST { publishedContentId, type, amount, currency, offerId?, ctaId?, source, externalReference?, notes? }
 * Revenueは manual / 正式API / import のみがFact。AIはこのAPIを直接呼ばない設計とする。
 * 1件のRevenueEventは必ず1つのpublishedContentIdにのみ属する（二重計上を構造的に防ぐ）。
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const body = await req.json();
    const publishedContentId = String(body.publishedContentId ?? "");
    const type = body.type;
    const amount = Number(body.amount);
    const currency = String(body.currency ?? "JPY");
    const source = body.source ?? "manual";

    if (!publishedContentId || !type || !Number.isFinite(amount)) {
      return NextResponse.json({ error: "publishedContentId / type / amount が必要です" }, { status: 400 });
    }
    if (!["manual", "api", "import"].includes(source)) {
      return NextResponse.json({ error: "sourceは manual/api/import のみです（AI生成は禁止）" }, { status: 400 });
    }

    const event: RevenueEvent = {
      id: `rev_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`,
      publishedContentId,
      offerId: body.offerId,
      ctaId: body.ctaId,
      type,
      amount,
      currency,
      quantity: body.quantity,
      occurredAt: body.occurredAt ?? new Date().toISOString(),
      source,
      externalReference: body.externalReference,
      notes: body.notes,
    };

    const file = await loadLedger();
    const next = await saveLedger({ ...file, revenueEvents: [event, ...file.revenueEvents] });
    return NextResponse.json({ event, total: totalRevenue(next.revenueEvents) });
  } catch (error) {
    console.error("[api/content/revenue] POST失敗:", error);
    return NextResponse.json({ error: "Revenueの記録に失敗しました" }, { status: 500 });
  }
}
