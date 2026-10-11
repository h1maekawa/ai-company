import { NextResponse } from "next/server";
import { readXObservabilityProjection } from "@/app/lib/company/observability/readXProjection";

export const dynamic = "force-dynamic";
export async function GET() {
  try {
    const projection = await readXObservabilityProjection();
    return NextResponse.json({ observedAt: projection.observedAt, readOnly: true, status: projection.status, reconciliation: projection.reconciliation }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ readOnly: true, status: "UNKNOWN", error: "RECONCILIATION_OBSERVABILITY_UNAVAILABLE" }, { status: 503 });
  }
}
