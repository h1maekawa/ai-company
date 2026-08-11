import { NextRequest, NextResponse } from "next/server";
import { loadOffers, saveOffers } from "@/app/lib/content/monetization/store";
import { Offer } from "@/app/lib/content/monetization/types";

export const dynamic = "force-dynamic";

export async function GET(): Promise<NextResponse> {
  try {
    return NextResponse.json(await loadOffers());
  } catch (error) {
    console.error("[api/content/offers] GET失敗:", error);
    return NextResponse.json({ error: "Offerの取得に失敗しました" }, { status: 500 });
  }
}

/** POST { offer }: Offer新規作成。有効化されていないtypeでも作成自体は可能（activeにするかは本人判断） */
export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const body = await req.json();
    const input = body.offer ?? {};
    if (!input.name || !input.type) {
      return NextResponse.json({ error: "name と type が必要です" }, { status: 400 });
    }
    const now = new Date().toISOString();
    const offer: Offer = {
      id: `offer_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`,
      name: input.name,
      type: input.type,
      description: input.description ?? "",
      destinationUrl: input.destinationUrl,
      price: input.price,
      currency: input.currency,
      status: input.status ?? "draft",
      affiliateNetwork: input.affiliateNetwork,
      affiliateProgram: input.affiliateProgram,
      affiliateDisclosureRequired: input.affiliateDisclosureRequired,
      affiliateLinkId: input.affiliateLinkId,
      productId: input.productId,
      createdAt: now,
      updatedAt: now,
    };
    const file = await loadOffers();
    const next = await saveOffers({ ...file, offers: [offer, ...file.offers] });
    return NextResponse.json({ offer, offers: next.offers });
  } catch (error) {
    console.error("[api/content/offers] POST失敗:", error);
    return NextResponse.json({ error: "Offerの作成に失敗しました" }, { status: 500 });
  }
}

/** PATCH { id, patch }: 更新（statusの activate/pause もここ） */
export async function PATCH(req: NextRequest): Promise<NextResponse> {
  try {
    const body = await req.json();
    const id = String(body.id ?? "");
    if (!id) return NextResponse.json({ error: "idが必要です" }, { status: 400 });

    const file = await loadOffers();
    const offers = file.offers.map((o) =>
      o.id === id ? { ...o, ...body.patch, id: o.id, updatedAt: new Date().toISOString() } : o
    );
    const next = await saveOffers({ ...file, offers });
    return NextResponse.json({ offers: next.offers });
  } catch (error) {
    console.error("[api/content/offers] PATCH失敗:", error);
    return NextResponse.json({ error: "Offerの更新に失敗しました" }, { status: 500 });
  }
}

/** DELETE ?id=xxx: 完全削除ではなくarchivedへ（記録として残す） */
export async function DELETE(req: NextRequest): Promise<NextResponse> {
  try {
    const id = req.nextUrl.searchParams.get("id");
    if (!id) return NextResponse.json({ error: "idが必要です" }, { status: 400 });

    const file = await loadOffers();
    const offers = file.offers.map((o) => (o.id === id ? { ...o, status: "archived" as const, updatedAt: new Date().toISOString() } : o));
    const next = await saveOffers({ ...file, offers });
    return NextResponse.json({ offers: next.offers });
  } catch (error) {
    console.error("[api/content/offers] DELETE失敗:", error);
    return NextResponse.json({ error: "Offerの削除に失敗しました" }, { status: 500 });
  }
}
