import { NextRequest, NextResponse } from "next/server";
import { loadOffers, saveOffers } from "@/app/lib/content/monetization/store";
import { Campaign } from "@/app/lib/content/monetization/types";

export const dynamic = "force-dynamic";

export async function GET(): Promise<NextResponse> {
  try {
    const { campaigns } = await loadOffers();
    return NextResponse.json({ campaigns });
  } catch (error) {
    console.error("[api/content/campaigns] GET失敗:", error);
    return NextResponse.json({ error: "Campaignの取得に失敗しました" }, { status: 500 });
  }
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const body = await req.json();
    const input = body.campaign ?? {};
    if (!input.name || !input.goal) {
      return NextResponse.json({ error: "name と goal が必要です" }, { status: 400 });
    }
    const now = new Date().toISOString();
    const campaign: Campaign = {
      id: `camp_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`,
      name: input.name,
      goal: input.goal,
      offerIds: input.offerIds ?? [],
      startAt: input.startAt,
      endAt: input.endAt,
      contentIds: [],
      status: "draft",
      createdAt: now,
      updatedAt: now,
    };
    const file = await loadOffers();
    const next = await saveOffers({ ...file, campaigns: [campaign, ...file.campaigns] });
    return NextResponse.json({ campaign, campaigns: next.campaigns });
  } catch (error) {
    console.error("[api/content/campaigns] POST失敗:", error);
    return NextResponse.json({ error: "Campaignの作成に失敗しました" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest): Promise<NextResponse> {
  try {
    const body = await req.json();
    const id = String(body.id ?? "");
    if (!id) return NextResponse.json({ error: "idが必要です" }, { status: 400 });
    const file = await loadOffers();
    const campaigns = file.campaigns.map((c) =>
      c.id === id ? { ...c, ...body.patch, id: c.id, updatedAt: new Date().toISOString() } : c
    );
    const next = await saveOffers({ ...file, campaigns });
    return NextResponse.json({ campaigns: next.campaigns });
  } catch (error) {
    console.error("[api/content/campaigns] PATCH失敗:", error);
    return NextResponse.json({ error: "Campaignの更新に失敗しました" }, { status: 500 });
  }
}
