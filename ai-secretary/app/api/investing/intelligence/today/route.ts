import { NextResponse } from "next/server";
import { readIntelligenceToday } from "@/app/lib/investing/intelligence/store";

export const dynamic = "force-dynamic";
export async function GET() {
  const result = await readIntelligenceToday();
  const ageSeconds = result.status === "AVAILABLE"
    ? Math.max(0, Math.floor((Date.now() - Date.parse(result.data.asOf)) / 1000))
    : null;
  return NextResponse.json({
    // Keep the original field and successful GET response code for existing clients.
    today: result.status === "AVAILABLE" ? result.data : null,
    store: {
      status: result.status,
      storage: "Vault",
      path: "memory/personal/fund/intelligence-today.json",
      lastSuccessfulAt: result.status === "AVAILABLE" ? result.data.asOf : null,
      ageSeconds,
      freshness: ageSeconds === null ? "UNKNOWN" : ageSeconds <= 48 * 60 * 60 ? "FRESH" : "STALE",
      ...(result.status === "UNAVAILABLE" ? { reason: result.reason } : {}),
    },
  });
}
