import { NextRequest, NextResponse } from "next/server";
import { loadLedger, saveLedger } from "@/app/lib/content/monetization/store";
import { Conversion } from "@/app/lib/content/monetization/types";

export const dynamic = "force-dynamic";

export async function GET(): Promise<NextResponse> {
  try {
    const { conversions } = await loadLedger();
    return NextResponse.json({ conversions });
  } catch (error) {
    console.error("[api/content/conversions] GET失敗:", error);
    return NextResponse.json({ error: "Conversionの取得に失敗しました" }, { status: 500 });
  }
}

/** POST { publishedContentId, eventType, offerId?, ctaId?, value?, source? } */
export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const body = await req.json();
    const publishedContentId = String(body.publishedContentId ?? "");
    const eventType = body.eventType;
    if (!publishedContentId || !eventType) {
      return NextResponse.json({ error: "publishedContentId と eventType が必要です" }, { status: 400 });
    }

    const conversion: Conversion = {
      id: `conv_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`,
      publishedContentId,
      offerId: body.offerId,
      ctaId: body.ctaId,
      eventType,
      value: body.value,
      occurredAt: body.occurredAt ?? new Date().toISOString(),
      source: body.source ?? "manual",
    };

    const file = await loadLedger();
    const next = await saveLedger({ ...file, conversions: [conversion, ...file.conversions] });
    return NextResponse.json({ conversion, conversions: next.conversions });
  } catch (error) {
    console.error("[api/content/conversions] POST失敗:", error);
    return NextResponse.json({ error: "Conversionの記録に失敗しました" }, { status: 500 });
  }
}
