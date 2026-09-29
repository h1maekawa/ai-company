import { NextResponse } from "next/server";
import { runDailyInvestmentResearch } from "@/app/lib/investing/intelligence/research";

export const maxDuration = 300;
export async function GET(request: Request) {
  const secret = request.headers.get("authorization");
  if (process.env.CRON_SECRET && secret !== `Bearer ${process.env.CRON_SECRET}`) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const today = await runDailyInvestmentResearch();
  return NextResponse.json({ ok: true, asOf: today.asOf, opportunities: today.opportunities.length });
}
