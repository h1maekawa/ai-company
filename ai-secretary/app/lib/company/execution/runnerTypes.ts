import type { ActionExecution, InternalArtifact } from "./executorTypes";
import type { CompanyEvent } from "../events";
import type { PipelineResult } from "./reviewer";
import type { SkillExecutionEvent, SkillImprovementCandidate } from "../evolution/skillObservability";
import type { CompanyImprovementCandidate, OperationalEvent } from "../evolution/operationalObservability";
import type { ResearchArtifact, ResearchItem, ResearchRun } from "../research/types";
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
  agentId?: string;
  inputRefs?: string[];
  outputRefs?: string[];
  knowledgeRefs?: string[];
};
export type MissionRun = {
  steps: number;
  modelCalls: number;
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
  attention?: AttentionItem[];
  learningQueue?: LearningQueueItem[];
  canaries?: CanaryResult[];
  skillExecutions?: SkillExecutionEvent[];
  skillImprovementCandidates?: SkillImprovementCandidate[];
  researchItems?: ResearchItem[];
  researchArtifacts?: ResearchArtifact[];
  researchRuns?: ResearchRun[];
  operationalEvents?: OperationalEvent[];
  companyImprovementCandidates?: CompanyImprovementCandidate[];
};
export type CanaryResult = {
  id: string;
  status: "PASS" | "FAIL";
  startedAt: string;
  completedAt: string;
  latencyMs: number;
  outputLength?: number;
  reviewVerdict?: "PASS" | "WARN" | "FAIL";
  error?: string;
  schemaValidated: boolean;
  redisPersisted: boolean;
  cancellationConfigured: boolean;
  cost: { status: "reported" | "unknown"; usd?: number; reason?: string };
  security: { status: "PASS" | "ALERT"; alert?: string };
  externalActionCount: 0;
};
export type AttentionItem = {
  id: string;
  fingerprint: string;
  missionId?: string;
  type: "APPROVAL_REQUIRED" | "MISSION_BLOCKED" | "SECURITY_ALERT" | "FIRST_REVENUE" | "SYSTEM_FAILURE";
  priority: "low" | "medium" | "high" | "critical";
  title: string;
  summary: string;
  targetId?: string;
  createdAt: string;
  resolvedAt?: string;
};
export type LearningQueueItem = {
  id: string;
  kind: "revenue" | "mission";
  payload: unknown;
  attempts: number;
  nextAttemptAt: string;
  createdAt: string;
};
export type RunnerLimits = {
  maxSteps: number;
  maxModelCalls: number;
  maxRetries: number;
  maxReplans: number;
  maxExecutionTime: number;
};
