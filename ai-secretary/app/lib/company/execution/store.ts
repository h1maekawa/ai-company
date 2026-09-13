/** Durable execution state facade. Production fails closed unless Redis exists. */
import { VAULT_ROOT } from "../../runtime/paths";
import type { ActionRequest } from "./actionGateway";
import type { ApprovalRequest } from "./approval";
import type { ExecutionPlan } from "./executionPlan";
import type { ExecutionMission } from "./mission";
import type { RunnerState } from "./runnerTypes";
import { LocalExecutionStore } from "../runtime/localExecutionStore";
import type { ExecutionSnapshot, ExecutionStore, StoreSaveOptions } from "../runtime/runtimeTypes";

export type ExecutionState = {
  runtime?: RunnerState;
  missions: ExecutionMission[];
  actionRequests: ActionRequest[];
  approvals: ApprovalRequest[];
  plans: ExecutionPlan[];
};

export function emptyExecutionState(): ExecutionState {
  return { missions: [], actionRequests: [], approvals: [], plans: [] };
}

let singleton: ExecutionStore | undefined;

export function getExecutionStore(): ExecutionStore {
  if (singleton) return singleton;
  const production = process.env.NODE_ENV === "production" || Boolean(process.env.VERCEL);
  try {
    const { DurableExecutionStore } = require("../runtime/durableExecutionStore") as typeof import("../runtime/durableExecutionStore");
    singleton = new DurableExecutionStore();
  } catch {
    if (VAULT_ROOT && !production) singleton = new LocalExecutionStore();
    else throw new Error("DURABLE_EXECUTION_STORE_REQUIRED");
  }
  return singleton;
}

export function setExecutionStoreForTests(store?: ExecutionStore) { singleton = store; }

export async function loadExecutionSnapshot(): Promise<ExecutionSnapshot> {
  return getExecutionStore().load();
}

export async function loadExecutionState(): Promise<ExecutionState> {
  return (await loadExecutionSnapshot()).state;
}

export async function saveExecutionState(state: ExecutionState, options?: Partial<StoreSaveOptions>): Promise<ExecutionState> {
  const store = getExecutionStore();
  const expectedVersion = options?.expectedVersion ?? (await store.load()).version;
  return (await store.save(state, { expectedVersion, lease: options?.lease })).state;
}
