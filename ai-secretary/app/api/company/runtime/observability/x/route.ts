import { NextResponse } from "next/server";
import { readXObservabilityProjection } from "@/app/lib/company/observability/readXProjection";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  try {
    return NextResponse.json(await readXObservabilityProjection(), { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ readOnly: true, status: "UNKNOWN", error: "X_OBSERVABILITY_UNAVAILABLE" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
