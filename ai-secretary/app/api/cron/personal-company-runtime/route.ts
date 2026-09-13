import { NextRequest, NextResponse } from "next/server";
import { verifyCronSecret } from "@/app/lib/integrations/machine-auth";
import { runAutonomousCycle } from "@/app/lib/company/runtime/autonomousCycle";
import { validateRuntimeEnvironment } from "@/app/lib/company/runtime/environment";
import { runtimeLog } from "@/app/lib/company/runtime/runtimeLog";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const auth = verifyCronSecret(req);
  if (!auth.ok) return NextResponse.json({ error: auth.reason }, { status: 401 });
  const validation = validateRuntimeEnvironment();
  if (!validation.ok || validation.environment.authority !== "vercel")
    return NextResponse.json({ error: validation.errors[0] ?? "VERCEL_PRODUCTION_AUTHORITY_REQUIRED" }, { status: 403 });
  if (!validation.environment.autonomousRuntimeEnabled) {
    runtimeLog({ event: "cron.runtime", result: "skipped" });
    return NextResponse.json({ ok: true, skipped: true, reason: "AUTONOMOUS_RUNTIME_DISABLED" });
  }
  try {
    const startedAt = Date.now();
    const result = await runAutonomousCycle();
    runtimeLog({ cycleId: result.cycleId, event: "cron.runtime", result: "success", latencyMs: Date.now() - startedAt });
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    runtimeLog({ event: "cron.runtime", result: "failure", error });
    return NextResponse.json({ error: error instanceof Error ? error.message : "CYCLE_FAILED" }, { status: 503 });
  }
}
