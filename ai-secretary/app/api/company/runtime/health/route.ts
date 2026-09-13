import { NextResponse } from "next/server";
import { getExecutionStore } from "@/app/lib/company/execution/store";
import { runtimeHealth } from "@/app/lib/company/runtime/operations";
import { deploymentMetadata } from "@/app/lib/company/runtime/deploymentMetadata";
import { validateRuntimeEnvironment } from "@/app/lib/company/runtime/environment";
import { loadRevenueEntries } from "@/app/lib/company/revenueStore";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const deployment = deploymentMetadata();
  const validation = validateRuntimeEnvironment();
  if (!validation.ok)
    return NextResponse.json({ environment: deployment.environment, runtime: "unhealthy", store: "unknown", scheduler: "disabled", autonomousExecution: false, deployment, errors: validation.errors }, { status: 503 });
  try {
    const health = await runtimeHealth(getExecutionStore());
    const revenueRead = await loadRevenueEntries().then(() => "ok" as const).catch(() => "degraded" as const);
    return NextResponse.json({
      environment: deployment.environment,
      authority: deployment.authority,
      runtime: "healthy",
      store: "connected",
      scheduler: validation.environment.autonomousRuntimeEnabled ? "enabled" : "disabled",
      autonomousExecution: validation.environment.autonomousRuntimeEnabled,
      canary: validation.environment.realModelCanaryEnabled ? "enabled" : "disabled",
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
