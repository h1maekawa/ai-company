import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/** Public liveness only. Readiness and operational data require a session. */
export async function GET() {
  return NextResponse.json({ status: "ok" }, { headers: { "Cache-Control": "public, max-age=30" } });
}
