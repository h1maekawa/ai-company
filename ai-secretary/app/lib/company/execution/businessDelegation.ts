import { DEPARTMENTS } from "../../config/departments";
import {
  authorizeBusinessDelegation,
  getBusinessManagerContract,
  type MicroBusinessId,
} from "../businessManager";
import { createManualMissionRecord, validateManualMissionInput } from "./manualMission";
import { executionTransaction } from "./transaction";
import { getExecutionStore, loadExecutionState, saveExecutionState } from "./store";
import type { ExecutionMission } from "./mission";

const IDEMPOTENCY_SCOPE = "business-manager-mission-create";
const WINDOW_MS = 24 * 60 * 60 * 1000;

export type BusinessDelegationInput = {
  /** Resolved by the authenticated server route; never accepted from the body. */
  businessId: string;
  workerAgentId: string;
  title?: unknown;
  description?: unknown;
  budgetYen?: number;
  executionCount?: number;
  deadline?: string;
  idempotencyKey?: string;
  now?: Date;
};

export type BusinessDelegationResult =
  | { ok: true; data: { mission: ExecutionMission; replayed?: boolean } }
  | { ok: false; status: number; error: string };

const fail = (status: number, error: string): BusinessDelegationResult => ({ ok: false, status, error });

function departmentForAgent(agentId: string) {
  for (const department of DEPARTMENTS) {
    if (department.secretaries?.some((agent) => agent.id === agentId)) return department.id;
    for (const room of department.rooms ?? []) {
      if (room.secretaries.some((agent) => agent.id === agentId)) return department.id;
    }
  }
  return undefined;
}

function findDuplicate(state: Awaited<ReturnType<typeof loadExecutionState>>, businessId: MicroBusinessId, requestId: string) {
  return state.missions.find((mission) => mission.businessId === businessId && mission.delegationRequestId === requestId);
}

/** Create one scoped Mission through the existing Execution Store and its CAS version. */
export async function createBusinessDelegationMission(input: BusinessDelegationInput): Promise<BusinessDelegationResult> {
  const business = getBusinessManagerContract(input.businessId);
  if (!business || !business.managerAgentId || business.status !== "ready") return fail(404, "BUSINESS_MANAGER_UNASSIGNED");
  const managerAgentId = business.managerAgentId;

  const validated = validateManualMissionInput({ title: input.title, description: input.description });
  if (!validated.ok) return fail(400, validated.error);
  const idempotencyKey = input.idempotencyKey?.trim();
  if (!idempotencyKey || idempotencyKey.length > 128) return fail(400, "IDEMPOTENCY_KEY_REQUIRED");
  if (typeof input.workerAgentId !== "string" || input.workerAgentId.length > 120) return fail(400, "WORKER_REQUIRED");

  const now = input.now ?? new Date();
  const budgetYen = input.budgetYen ?? 0;
  const executionCount = input.executionCount ?? 1;
  const deadline = input.deadline ?? new Date(now.getTime() + business.limits.maxDurationHours * 60 * 60 * 1000).toISOString();
  const requestId = idempotencyKey;
  const storeKey = `${business.id}:${idempotencyKey}`;
  const store = getExecutionStore();

  const cached = await store.getIdempotencyResult<BusinessDelegationResult>(IDEMPOTENCY_SCOPE, storeKey);
  if (cached) {
    return cached.ok ? { ...cached, data: { ...cached.data, replayed: true } } : cached;
  }

  // Recover a saved Mission if the snapshot write succeeded but idempotency result persistence failed.
  const existingState = await loadExecutionState();
  const existingMission = findDuplicate(existingState, business.id, requestId);
  if (existingMission) {
    const recovered: BusinessDelegationResult = { ok: true, data: { mission: existingMission, replayed: true } };
    await store.completeIdempotency(IDEMPOTENCY_SCOPE, storeKey, recovered);
    return recovered;
  }

  if (!(await store.claimIdempotency(IDEMPOTENCY_SCOPE, storeKey))) {
    return fail(409, "DUPLICATE_REQUEST_IN_PROGRESS");
  }

  try {
    return await executionTransaction(async () => {
      // Always authorize against the latest shared snapshot while holding the execution transaction.
      const state = await loadExecutionState();
      const duplicate = findDuplicate(state, business.id, requestId);
      if (duplicate) {
        const recovered: BusinessDelegationResult = { ok: true, data: { mission: duplicate, replayed: true } };
        await store.completeIdempotency(IDEMPOTENCY_SCOPE, storeKey, recovered);
        return recovered;
      }

      const cutoff = now.getTime() - WINDOW_MS;
      const businessMissions = state.missions.filter((mission) => mission.businessId === business.id);
      const recentMissions: ExecutionMission[] = [];
      for (const mission of businessMissions) {
        const createdAt = Date.parse(mission.createdAt);
        if (!Number.isFinite(createdAt)) {
          const denied = fail(503, "BUSINESS_MISSION_STATE_UNAVAILABLE");
          await store.completeIdempotency(IDEMPOTENCY_SCOPE, storeKey, denied);
          return denied;
        }
        if (createdAt >= cutoff) recentMissions.push(mission);
      }

      let cumulativeBudgetYen = 0;
      for (const mission of recentMissions) {
        if (!Number.isSafeInteger(mission.delegationBudgetYen) || mission.delegationBudgetYen! < 0) {
          const denied = fail(503, "BUSINESS_BUDGET_STATE_UNAVAILABLE");
          await store.completeIdempotency(IDEMPOTENCY_SCOPE, storeKey, denied);
          return denied;
        }
        cumulativeBudgetYen += mission.delegationBudgetYen!;
        if (!Number.isSafeInteger(cumulativeBudgetYen)) {
          const denied = fail(503, "BUSINESS_BUDGET_STATE_UNAVAILABLE");
          await store.completeIdempotency(IDEMPOTENCY_SCOPE, storeKey, denied);
          return denied;
        }
      }

      const decision = authorizeBusinessDelegation({
        businessId: business.id,
        // Principal is resolved from the server-side Business Registry, never the model/body.
        actorAgentId: managerAgentId,
        workerAgentId: input.workerAgentId,
        actionType: "ANALYSIS",
        budgetYen,
        cumulativeBudgetYen,
        missionsInLast24Hours: recentMissions.length,
        executionCount,
        deadline,
        delegationDepth: 0,
      }, now);
      if (!decision.allowed) {
        const denied = fail(403, decision.reason);
        await store.completeIdempotency(IDEMPOTENCY_SCOPE, storeKey, denied);
        return denied;
      }

      const departmentId = departmentForAgent(decision.workerAgentId);
      if (!departmentId) {
        const denied = fail(403, "WORKER_NOT_AUTHORIZED");
        await store.completeIdempotency(IDEMPOTENCY_SCOPE, storeKey, denied);
        return denied;
      }

      const mission: ExecutionMission = {
        ...createManualMissionRecord({
          ...validated,
          now,
          routingContext: {
            departmentId,
            requiredAgentId: decision.workerAgentId,
            missionType: `BUSINESS_${business.id}_DELEGATION`,
            constraints: ["INTERNAL_TASK_ONLY", "EXTERNAL_ACTIONS_REQUIRE_ACTION_GATEWAY", "R4_ACTIONS_PROHIBITED"],
          },
        }),
        assignedAgentId: decision.workerAgentId,
        businessId: business.id,
        delegatedByAgentId: decision.managerAgentId,
        delegationRequestId: requestId,
        delegationBudgetYen: budgetYen,
        delegationRunLimit: executionCount,
        delegationRunCount: 0,
      };
      await saveExecutionState({ ...state, missions: [...state.missions, mission] });
      const created: BusinessDelegationResult = { ok: true, data: { mission } };
      await store.completeIdempotency(IDEMPOTENCY_SCOPE, storeKey, created);
      return created;
    });
  } catch (error) {
    const failed = fail(503, error instanceof Error && error.message === "EXECUTION_BUSY" ? "EXECUTION_BUSY" : "EXECUTION_STORE_UNAVAILABLE");
    await store.completeIdempotency(IDEMPOTENCY_SCOPE, storeKey, failed).catch(() => undefined);
    return failed;
  }
}
