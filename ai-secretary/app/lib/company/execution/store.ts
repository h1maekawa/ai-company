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
  /** Pending Slack memory writes only. Vault remains the conversation source of truth. */
  slackMemory?: import("../../integrations/slack/memory/types").SlackMemoryRuntime;
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
// Enumerable symbols survive the object spreads used by every facade caller,
// while remaining absent from the serialized execution state.
const readVersion = Symbol("execution-read-version");
type VersionedState = ExecutionState & { [readVersion]?: number };
function bindVersion(state: ExecutionState, version: number): ExecutionState {
  Object.defineProperty(state, readVersion, { value: version, enumerable: true, configurable: true });
  return state;
}

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
  const snapshot = await getExecutionStore().load();
  bindVersion(snapshot.state, snapshot.version);
  return snapshot;
}

export async function loadExecutionState(): Promise<ExecutionState> {
  return (await loadExecutionSnapshot()).state;
}

export async function saveExecutionState(state: ExecutionState, options?: Partial<StoreSaveOptions>): Promise<ExecutionState> {
  assertProductionMutationAllowed();
  const store = getExecutionStore();
  const boundVersion = (state as VersionedState)[readVersion];
  if (boundVersion === undefined && options?.expectedVersion === undefined) throw new Error("EXECUTION_EXPECTED_VERSION_REQUIRED");
  if (boundVersion !== undefined && options?.expectedVersion !== undefined && boundVersion !== options.expectedVersion) throw new Error("EXECUTION_VERSION_MISMATCH");
  const saved = await store.save(state, { expectedVersion: options?.expectedVersion ?? boundVersion!, lease: options?.lease });
  return bindVersion(saved.state, saved.version);
}
