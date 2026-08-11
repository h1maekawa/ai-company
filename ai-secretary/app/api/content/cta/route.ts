import { NextRequest, NextResponse } from "next/server";
import { loadCtaLibrary, saveCtaLibrary } from "@/app/lib/content/monetization/store";
import { CTA } from "@/app/lib/content/monetization/types";

export const dynamic = "force-dynamic";

export async function GET(): Promise<NextResponse> {
  try {
    return NextResponse.json({ ctas: await loadCtaLibrary() });
  } catch (error) {
    console.error("[api/content/cta] GET失敗:", error);
    return NextResponse.json({ error: "CTAの取得に失敗しました" }, { status: 500 });
  }
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const body = await req.json();
    const input = body.cta ?? {};
    if (!input.name || !input.type || !input.text) {
      return NextResponse.json({ error: "name / type / text が必要です" }, { status: 400 });
    }
    const now = new Date().toISOString();
    const cta: CTA = {
      id: `cta_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`,
      name: input.name,
      type: input.type,
      text: input.text,
      offerId: input.offerId,
      destinationUrl: input.destinationUrl,
      placement: input.placement,
      createdAt: now,
      updatedAt: now,
    };
    const existing = await loadCtaLibrary();
    const ctas = await saveCtaLibrary([cta, ...existing]);
    return NextResponse.json({ cta, ctas });
  } catch (error) {
    console.error("[api/content/cta] POST失敗:", error);
    return NextResponse.json({ error: "CTAの作成に失敗しました" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest): Promise<NextResponse> {
  try {
    const body = await req.json();
    const id = String(body.id ?? "");
    if (!id) return NextResponse.json({ error: "idが必要です" }, { status: 400 });
    const existing = await loadCtaLibrary();
    const ctas = await saveCtaLibrary(
      existing.map((c) => (c.id === id ? { ...c, ...body.patch, id: c.id, updatedAt: new Date().toISOString() } : c))
    );
    return NextResponse.json({ ctas });
  } catch (error) {
    console.error("[api/content/cta] PATCH失敗:", error);
    return NextResponse.json({ error: "CTAの更新に失敗しました" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest): Promise<NextResponse> {
  try {
    const id = req.nextUrl.searchParams.get("id");
    if (!id) return NextResponse.json({ error: "idが必要です" }, { status: 400 });
    const existing = await loadCtaLibrary();
    const ctas = await saveCtaLibrary(existing.filter((c) => c.id !== id));
    return NextResponse.json({ ctas });
  } catch (error) {
    console.error("[api/content/cta] DELETE失敗:", error);
    return NextResponse.json({ error: "CTAの削除に失敗しました" }, { status: 500 });
  }
}
