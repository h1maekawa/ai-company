import { NextResponse } from "next/server";
import { loadIntelligenceToday } from "@/app/lib/investing/intelligence/store";

export const dynamic = "force-dynamic";
export async function GET() {
  const today = await loadIntelligenceToday();
  return NextResponse.json({ opportunities: today?.opportunities ?? [], asOf: today?.asOf ?? null });
}
