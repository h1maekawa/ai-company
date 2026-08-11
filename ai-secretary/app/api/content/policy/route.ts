import { NextRequest, NextResponse } from "next/server";
import { loadOffers, saveOffers } from "@/app/lib/content/monetization/store";

export const dynamic = "force-dynamic";

/** GET: MonetizationPolicy（AIが有効化されていないOfferTypeを勝手に推薦しないための境界） */
export async function GET(): Promise<NextResponse> {
  try {
    const { policy } = await loadOffers();
    return NextResponse.json({ policy });
  } catch (error) {
    console.error("[api/content/policy] GET失敗:", error);
    return NextResponse.json({ error: "Policyの取得に失敗しました" }, { status: 500 });
  }
}

export async function PUT(req: NextRequest): Promise<NextResponse> {
  try {
    const body = await req.json();
    const file = await loadOffers();
    const policy = { ...file.policy, ...body.policy, updatedAt: new Date().toISOString() };
    const next = await saveOffers({ ...file, policy });
    return NextResponse.json({ policy: next.policy });
  } catch (error) {
    console.error("[api/content/policy] PUT失敗:", error);
    return NextResponse.json({ error: "Policyの更新に失敗しました" }, { status: 500 });
  }
}
