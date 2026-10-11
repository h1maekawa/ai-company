import { NextResponse } from "next/server";
import { readXObservabilityProjection } from "@/app/lib/company/observability/readXProjection";

export const dynamic = "force-dynamic";
export async function GET(_request: Request, context: { params: Promise<{ slotId: string }> }) {
  try {
    const { slotId } = await context.params;
    const projection = await readXObservabilityProjection();
    const slot = projection.slots.find((item) => item.plan.slotId === slotId);
    if (!slot) return NextResponse.json({ readOnly: true, error: "SLOT_NOT_FOUND" }, { status: 404 });
    return NextResponse.json({ observedAt: projection.observedAt, readOnly: true, slot }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ readOnly: true, status: "UNKNOWN", error: "X_SLOT_OBSERVABILITY_UNAVAILABLE" }, { status: 503 });
  }
}
