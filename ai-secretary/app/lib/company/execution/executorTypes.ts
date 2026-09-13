import type { ActionRequest } from "./actionGateway";
import type { ExecutionState } from "./store";
import type { FullMissionStatus } from "./mission";

export type InternalActionPayload = {
  status?: FullMissionStatus;
  path?: string;
  content?: string;
  reportType?:
    | "Mission Report"
    | "Daily Report"
    | "Agent Result"
    | "Reviewer Result"
    | "Learning Summary";
};
export type ExecutorStatus =
  | "EXECUTED"
  | "DRY_RUN"
  | "NO_EXECUTOR"
  | "BLOCKED"
  | "WAITING_APPROVAL"
  | "FAILED";
export type ExecutorResult = {
  status: ExecutorStatus;
  reason?: string;
  outputId?: string;
};
export type ApprovedActionRequest = ActionRequest & {
  status: "AUTO_APPROVED" | "APPROVED";
};
export type ExecutionContext = {
  state: ExecutionState;
  payload: InternalActionPayload;
  now: Date;
};
export interface ActionExecutor {
  actionType: string;
  execute(
    request: ApprovedActionRequest,
    context: ExecutionContext,
  ): ExecutorResult;
}
export type ActionExecution = ExecutorResult & {
  actionRequestId: string;
  payload: InternalActionPayload;
  at: string;
};
export type InternalArtifact = {
  id: string;
  missionId: string;
  agentId: string;
  path: string;
  content: string;
  createdAt: string;
};
