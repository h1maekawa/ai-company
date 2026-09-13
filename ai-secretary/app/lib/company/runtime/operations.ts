import { randomUUID } from "node:crypto";
import type { ExecutionState } from "../execution/store";
import type { AttentionItem } from "../execution/runnerTypes";
import type { ExecutionStore } from "./runtimeTypes";
import { deploymentMetadata } from "./deploymentMetadata";
import { runtimeEnvironment } from "./environment";

export function addAttention(state: ExecutionState, item: Omit<AttentionItem, "id" | "createdAt">, now = new Date()) {
  const runtime = (state.runtime ??= { runs: {}, executions: [], artifacts: [], learning: [], attention: [], learningQueue: [] });
  runtime.attention ??= [];
  const existing = runtime.attention.find((entry) => entry.fingerprint === item.fingerprint && !entry.resolvedAt);
  if (existing) return existing;
  const created = { ...item, id: randomUUID(), createdAt: now.toISOString() };
  runtime.attention.push(created);
  return created;
}

export async function runtimeHealth(store: ExecutionStore) {
  const startedAt = Date.now();
  const [snapshot, events] = await Promise.all([store.load(), store.listEvents(100)]);
  const storeLatencyMs = Date.now() - startedAt;
  const active = snapshot.state.missions.filter((mission) =>
    ["ACTIVE", "EXECUTING", "REVIEWING", "REPLAN_REQUIRED"].includes(mission.status),
  );
  const leases = (await Promise.all(active.map((mission) => store.getLease(mission.id)))).filter(Boolean);
  const failures = events.filter((entry) => ["CYCLE_FAILED", "LEASE_FAILED", "LEASE_EXPIRED"].includes(entry.type));
  const lastCycleEnd = events.find((entry) => entry.type === "CYCLE_COMPLETED" || entry.type === "CYCLE_FAILED");
  const lastCycleStart = lastCycleEnd
    ? events.find((entry) => entry.type === "CYCLE_STARTED" && entry.cycleId === lastCycleEnd.cycleId)
    : events.find((entry) => entry.type === "CYCLE_STARTED");
  return {
    schemaVersion: snapshot.schemaVersion,
    deployment: deploymentMetadata(),
    environment: runtimeEnvironment(),
    store: store.kind,
    storeVersion: snapshot.version,
    updatedAt: snapshot.updatedAt,
    activeMissions: active.length,
    pendingMissions: snapshot.state.missions.filter((mission) => ["PLANNED", "open", "ACTIVE", "EXECUTING", "REVIEWING", "REPLAN_REQUIRED"].includes(mission.status)).length,
    runningMissions: snapshot.state.missions.filter((mission) => ["EXECUTING", "REVIEWING"].includes(mission.status)).length,
    blockedMissions: snapshot.state.missions.filter((mission) => mission.status === "BLOCKED").length,
    activeLeases: leases.length,
    pendingApprovals: snapshot.state.approvals.filter((approval) => approval.status === "PENDING").length,
    attention: snapshot.state.runtime?.attention?.filter((item) => !item.resolvedAt) ?? [],
    recentFailures: failures.slice(0, 20),
    leaseConflicts: events.filter((entry) => entry.type === "LEASE_FAILED").length,
    recoveryCount: events.filter((entry) => entry.type === "MISSION_RECOVERED").length,
    failedCycles: events.filter((entry) => entry.type === "CYCLE_FAILED").length,
    learningPending: snapshot.state.runtime?.learningQueue?.length ?? 0,
    storeLatencyMs,
    lastAutonomousCycle: events.find((entry) => entry.type === "CYCLE_COMPLETED" || entry.type === "CYCLE_FAILED") ?? null,
    lastCycleStartedAt: lastCycleStart?.createdAt ?? null,
    lastCycleCompletedAt: lastCycleEnd?.createdAt ?? null,
    lastCycleStatus: lastCycleEnd?.type === "CYCLE_COMPLETED" ? "success" : lastCycleEnd ? "failure" : "never",
    lastCycleDuration: lastCycleStart && lastCycleEnd ? Math.max(0, Date.parse(lastCycleEnd.createdAt) - Date.parse(lastCycleStart.createdAt)) : null,
    nextScheduledRun: "daily 21:15 UTC",
  };
}
