import { NextResponse } from "next/server";
import { loadInvestmentPhase2Readiness } from "@/app/lib/investing/intelligence/readiness";

export const dynamic = "force-dynamic";

/** GET-only, read-only Phase 2 Production readiness audit. */
export async function GET(): Promise<NextResponse> {
  return NextResponse.json(await loadInvestmentPhase2Readiness());
}
