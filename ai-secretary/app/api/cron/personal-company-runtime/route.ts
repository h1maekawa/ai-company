import { NextRequest, NextResponse } from "next/server";
import { verifyCronSecret } from "@/app/lib/integrations/machine-auth";
import { runAutonomousCycle } from "@/app/lib/company/runtime/autonomousCycle";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const auth = verifyCronSecret(req);
  if (!auth.ok) return NextResponse.json({ error: auth.reason }, { status: 401 });
  try {
    return NextResponse.json({ ok: true, ...(await runAutonomousCycle()) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "CYCLE_FAILED" }, { status: 503 });
  }
}
