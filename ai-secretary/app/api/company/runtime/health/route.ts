import { NextResponse } from "next/server";
import { getExecutionStore } from "@/app/lib/company/execution/store";
import { runtimeHealth } from "@/app/lib/company/runtime/operations";
import { deploymentMetadata } from "@/app/lib/company/runtime/deploymentMetadata";
import { validateRuntimeEnvironment } from "@/app/lib/company/runtime/environment";
import { loadRevenueEntries } from "@/app/lib/company/revenueStore";
import { CanaryResultStore } from "@/app/lib/company/runtime/canaryStore";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const deployment = deploymentMetadata();
  const validation = validateRuntimeEnvironment();
  if (!validation.ok)
    return NextResponse.json({ environment: deployment.environment, runtime: "unhealthy", store: "unknown", scheduler: "disabled", autonomousExecution: false, deployment, errors: validation.errors }, { status: 503 });
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
    });
  } catch (error) {
    const reason = error instanceof Error ? error.message : "STORE_ERROR";
    return NextResponse.json({
      environment: deployment.environment,
      authority: deployment.authority,
      runtime: "unhealthy",
      store: "disconnected",
      scheduler: "disabled",
      autonomousExecution: false,
      deployment,
      systemFailure: { type: "SYSTEM_FAILURE", fingerprint: "runtime-health:" + reason, reason },
    }, { status: 503 });
  }
}
