/** Durable execution state facade. Production fails closed unless Redis exists. */
import { VAULT_ROOT } from "../../runtime/paths";
import type { ActionRequest } from "./actionGateway";
import type { ApprovalRequest } from "./approval";
import type { ExecutionPlan } from "./executionPlan";
import type { ExecutionMission } from "./mission";
import type { RunnerState } from "./runnerTypes";
import type { ContentDraftCandidate } from "./contentHandoff";
import type { SkillCandidate } from "../evolution/skillCandidates";
import type { SkillEngineeringHandoff, SkillEngineeringSpecification } from "../evolution/skillEngineering";
import type { CompanyImprovementHandoff, CompanyImprovementSpecification } from "../evolution/companyImprovementEngineering";
import { LocalExecutionStore } from "../runtime/localExecutionStore";
import type { ExecutionSnapshot, ExecutionStore, StoreSaveOptions } from "../runtime/runtimeTypes";
import { assertProductionMutationAllowed, runtimeEnvironment } from "../runtime/environment";

export type ExecutionState = {
  runtime?: RunnerState;
  missions: ExecutionMission[];
  actionRequests: ActionRequest[];
  approvals: ApprovalRequest[];
  plans: ExecutionPlan[];
  /** Workflow output handoff metadata. Formal drafts remain in the existing Content Core stores. */
  contentDraftCandidates: ContentDraftCandidate[];
  /** Evidence-backed proposals only; executable Skills remain in the existing Skill Registry. */
  skillCandidates: SkillCandidate[];
  skillEngineeringSpecifications: SkillEngineeringSpecification[];
  skillEngineeringHandoffs: SkillEngineeringHandoff[];
  companyImprovementSpecifications: CompanyImprovementSpecification[];
  companyImprovementHandoffs: CompanyImprovementHandoff[];
};

export function emptyExecutionState(): ExecutionState {
  return { missions: [], actionRequests: [], approvals: [], plans: [], contentDraftCandidates: [], skillCandidates: [], skillEngineeringSpecifications: [], skillEngineeringHandoffs: [], companyImprovementSpecifications: [], companyImprovementHandoffs: [] };
}

let singleton: ExecutionStore | undefined;

export function getExecutionStore(): ExecutionStore {
  if (singleton) return singleton;
  const production = runtimeEnvironment().stage !== "development";
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
  assertProductionMutationAllowed();
  const store = getExecutionStore();
  const expectedVersion = options?.expectedVersion ?? (await store.load()).version;
  return (await store.save(state, { expectedVersion, lease: options?.lease })).state;
}
