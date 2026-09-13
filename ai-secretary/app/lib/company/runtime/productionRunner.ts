import { randomUUID } from "node:crypto";
import { buildOrganizationSnapshot } from "../organization";
import { runAgent, type StepWorker } from "../execution/agentRunner";
import { internalStepWorker } from "../execution/stepWorker";
import type { ExecutionStore, LeaseGuard } from "./runtimeTypes";
import { getExecutionStore } from "../execution/store";
import { RUNTIME_DEFAULTS } from "./runtimeConfig";

const event = (type: Parameters<ExecutionStore["appendEvent"]>[0]["type"], missionId: string, holderId: string, detail?: string) => ({
  id: randomUUID(), type, missionId, holderId, detail, createdAt: new Date().toISOString(),
  at: new Date().toISOString(), kind: type.startsWith("LEASE") ? "runtime.lease" as const : "runtime.recovery" as const,
  department: "personal", actor: holderId, action: type, outcome: type === "LEASE_FAILED" ? "failure" as const : "success" as const,
  signature: type + ":" + missionId, humanIntervention: false,
});

export async function runProductionMission(input: {
  missionId: string;
  idempotencyKey?: string;
  store?: ExecutionStore;
  worker?: StepWorker;
  leaseTtlMs?: number;
  heartbeatIntervalMs?: number;
}) {
  const store = input.store ?? getExecutionStore();
  const holderId = randomUUID();
  const ttl = input.leaseTtlMs ?? RUNTIME_DEFAULTS.missionLeaseTtlMs;
  const lease = await store.acquireLease(input.missionId, holderId, ttl);
  if (!lease) {
    await store.appendEvent(event("LEASE_FAILED", input.missionId, holderId, "MISSION_BUSY"));
    throw new Error("MISSION_BUSY");
  }
  const guard: LeaseGuard = lease;
  await store.appendEvent(event("LEASE_ACQUIRED", input.missionId, holderId));
  const key = input.idempotencyKey ?? "mission:" + input.missionId + ":" + lease.fencingToken;
  const prior = await store.getIdempotencyResult<unknown>("mission-run", key);
  if (prior) {
    await store.releaseLease(guard);
    return prior;
  }
  if (!(await store.claimIdempotency("mission-run", key))) {
    await store.releaseLease(guard);
    throw new Error("DUPLICATE_REQUEST_IN_PROGRESS");
  }
  let heartbeatError: Error | undefined;
  const heartbeat = setInterval(() => {
    void store.heartbeatLease(guard, ttl).catch((error) => {
      heartbeatError = error instanceof Error ? error : new Error("LEASE_EXPIRED");
    });
  }, input.heartbeatIntervalMs ?? RUNTIME_DEFAULTS.heartbeatIntervalMs);
  try {
    let snapshot = await store.load();
    const state = snapshot.state;
    const mission = state.missions.find((item) => item.id === input.missionId);
    if (!mission) throw new Error("MISSION_NOT_FOUND");
    let recovered = false;
    const run = state.runtime?.runs[input.missionId];
    for (const history of run?.history ?? []) {
      if (history.status === "RUNNING") {
        history.status = "UNKNOWN_RESULT";
        history.reason = "PROCESS_INTERRUPTED_AFTER_DISPATCH";
        recovered = true;
      }
    }
    const plan = state.plans.find((item) => item.id === mission.executionPlanId);
    for (const step of plan?.steps ?? []) {
      if (step.status === "RUNNING") {
        step.status = "PENDING";
        recovered = true;
      }
    }
    if (recovered) {
      snapshot = await store.save(state, { expectedVersion: snapshot.version, lease: guard });
      await store.appendEvent(event("MODEL_RESULT_UNKNOWN", input.missionId, holderId));
      await store.appendEvent(event("MISSION_RECOVERED", input.missionId, holderId));
    } else if (state.runtime?.runs[input.missionId]) {
      await store.appendEvent(event("MISSION_RESUMED", input.missionId, holderId));
    }
    const agent = buildOrganizationSnapshot().agents.find((item) => item.id === mission.assignedAgentId) ?? null;
    await runAgent(state, input.missionId, agent, input.worker ?? internalStepWorker, {}, async (next) => {
      if (heartbeatError) throw heartbeatError;
      snapshot = await store.save(next, { expectedVersion: snapshot.version, lease: guard });
    });
    snapshot = await store.save(state, { expectedVersion: snapshot.version, lease: guard });
    const result = {
      mission: snapshot.state.missions.find((item) => item.id === input.missionId),
      runtime: snapshot.state.runtime,
    };
    await store.completeIdempotency("mission-run", key, result);
    return result;
  } finally {
    clearInterval(heartbeat);
    await store.releaseLease(guard).catch(() => undefined);
  }
}
