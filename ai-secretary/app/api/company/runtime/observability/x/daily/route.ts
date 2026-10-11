import { NextRequest, NextResponse } from "next/server";
import { readXObservabilityProjection } from "@/app/lib/company/observability/readXProjection";

export const dynamic = "force-dynamic";
export async function GET(request: NextRequest) {
  try {
    const projection = await readXObservabilityProjection();
    const date = request.nextUrl.searchParams.get("date") ?? new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tokyo", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
    const slots = projection.slots.filter((slot) => slot.plan.planDate === date);
    return NextResponse.json({ observedAt: projection.observedAt, readOnly: true, date, status: projection.status, slots }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ readOnly: true, status: "UNKNOWN", error: "X_DAILY_OBSERVABILITY_UNAVAILABLE" }, { status: 503 });
  }
}
