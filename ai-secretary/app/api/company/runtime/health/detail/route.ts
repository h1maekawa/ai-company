import { NextRequest, NextResponse } from "next/server";
import { getExecutionStore } from "@/app/lib/company/execution/store";
import { runtimeHealth } from "@/app/lib/company/runtime/operations";
import { deploymentMetadata } from "@/app/lib/company/runtime/deploymentMetadata";
import { validateRuntimeEnvironment } from "@/app/lib/company/runtime/environment";
import { loadRevenueEntries } from "@/app/lib/company/revenueStore";
import { CanaryResultStore } from "@/app/lib/company/runtime/canaryStore";
import { SESSION_COOKIE, verifySessionToken } from "@/app/lib/auth/session";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const secret = process.env.SESSION_SECRET;
  let authenticated = false;
  try { authenticated = Boolean(secret && await verifySessionToken(request.cookies.get(SESSION_COOKIE)?.value, secret)); }
  catch { return NextResponse.json({ error: "認証を一時的に利用できません" }, { status: 503 }); }
  if (!authenticated) return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
  const deployment = deploymentMetadata();
  const validation = validateRuntimeEnvironment();
  if (!validation.ok) return NextResponse.json({ runtime: "unhealthy", errors: validation.errors }, { status: 503 });
  try {
    const health = await runtimeHealth(getExecutionStore());
    const [revenueRead, canaries] = await Promise.all([
      loadRevenueEntries().then(() => "ok" as const).catch(() => "degraded" as const),
      new CanaryResultStore().recent(3),
    ]);
    return NextResponse.json({
      environment: deployment.environment,
      authority: deployment.authority,
      runtime: "healthy",
      store: "connected",
      scheduler: validation.environment.autonomousRuntimeEnabled ? "enabled" : "disabled",
      autonomousExecution: validation.environment.autonomousRuntimeEnabled,
      canary: validation.environment.realModelCanaryEnabled ? "enabled" : "disabled",
      latestCanary: canaries[0] ? {
        id: canaries[0].id, status: canaries[0].status, completedAt: canaries[0].completedAt,
        latencyMs: canaries[0].latencyMs, schemaValidated: canaries[0].schemaValidated,
        redisPersisted: canaries[0].redisPersisted, reviewVerdict: canaries[0].reviewVerdict,
        cost: canaries[0].cost, security: canaries[0].security,
        externalActionCount: canaries[0].externalActionCount,
      } : null,
      canaryAlert: canaries.length >= 3 && canaries.slice(0, 3).every((item) => item.status === "FAIL")
        ? { type: "SECURITY_ALERT", reason: "CANARY_CONSECUTIVE_FAILURES", count: 3 }
        : null,
      deployment,
      smokeTest: { redisConnectivity: "ok", missionRead: "ok", approvalRead: "ok", revenueRead },
      metrics: {
        pendingMissions: health.pendingMissions,
        runningMissions: health.runningMissions,
        blockedMissions: health.blockedMissions,
        pendingApprovals: health.pendingApprovals,
        learningPending: health.learningPending,
        lastCycleStartedAt: health.lastCycleStartedAt,
        lastCycleCompletedAt: health.lastCycleCompletedAt,
        lastCycleStatus: health.lastCycleStatus,
        lastCycleDuration: health.lastCycleDuration,
        nextExpectedCycle: health.nextScheduledRun,
      },
    }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ runtime: "unhealthy", store: "disconnected" }, { status: 503 });
  }
}
