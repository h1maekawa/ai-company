import { NextResponse } from "next/server";
import { loadIntelligenceToday } from "@/app/lib/investing/intelligence/store";

export const dynamic = "force-dynamic";
export async function GET() {
  return NextResponse.json({ today: await loadIntelligenceToday() });
}
