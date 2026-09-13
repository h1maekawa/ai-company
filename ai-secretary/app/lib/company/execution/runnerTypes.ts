import type { ActionExecution, InternalArtifact } from "./executorTypes";
import type { CompanyEvent } from "../events";
import type { PipelineResult } from "./reviewer";
export type LearningEventType =
  | "MISSION_SUCCEEDED"
  | "MISSION_FAILED"
  | "MISSION_BLOCKED"
  | "APPROVAL_APPROVED"
  | "APPROVAL_REJECTED"
  | "ACTION_BLOCKED"
  | "REVIEW_FAILED"
  | "REVENUE_GENERATED"
  | "OPPORTUNITY_VALIDATED";
export type LearningEvent = CompanyEvent & {
  type: LearningEventType;
  missionId?: string;
  opportunityId?: string;
  reason?: string;
  actionType?: string;
  originalProposal?: string;
  missionType?: string;
  revenueId?: string;
  revenueYen?: number;
  reviewScore?: number;
};
export type StepHistory = {
  planId: string;
  stepId: string;
  at: string;
  status: string;
  reason?: string;
  output?: string;
  actionRequestId?: string;
};
export type MissionRun = {
  steps: number;
  retries: number;
  replans: number;
  elapsedMs: number;
  rejectionReason?: string;
  rejectedProposals: string[];
  history: StepHistory[];
  review?: PipelineResult;
  reviewHistory?: PipelineResult[];
  stopReason?: string;
};
export type RunnerState = {
  runs: Record<string, MissionRun>;
  executions: ActionExecution[];
  artifacts: InternalArtifact[];
  learning: LearningEvent[];
};
export type RunnerLimits = {
  maxSteps: number;
  maxRetries: number;
  maxReplans: number;
  maxExecutionTime: number;
};
