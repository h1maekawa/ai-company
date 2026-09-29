import { NextResponse } from "next/server";
import { loadIntelligenceToday } from "@/app/lib/investing/intelligence/store";

export const dynamic = "force-dynamic";
export async function GET(_: Request, { params }: { params: { id: string } }) {
  const today = await loadIntelligenceToday();
  const opportunity = today?.opportunities.find((item) => item.id === params.id) ?? null;
  return opportunity ? NextResponse.json({ opportunity, marketRegime: today?.marketRegime }) : NextResponse.json({ error: "Opportunity not found" }, { status: 404 });
}
