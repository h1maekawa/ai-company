import { NextResponse } from "next/server";
import { loadIntelligenceToday } from "@/app/lib/investing/intelligence/store";

export const dynamic = "force-dynamic";
export async function GET(_: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const today = await loadIntelligenceToday();
  const opportunity = today?.opportunities.find((item) => item.id === params.id) ?? null;
  return opportunity ? NextResponse.json({ opportunity, marketRegime: today?.marketRegime }) : NextResponse.json({ error: "Opportunity not found" }, { status: 404 });
}
