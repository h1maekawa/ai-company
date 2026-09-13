import { createCompanyEvent } from "../events";
import type { ExecutionState } from "./store";
import type { LearningEvent, LearningEventType } from "./runnerTypes";
import { emptyRunnerState } from "./runnerConfig";
const kinds = {
  MISSION_SUCCEEDED: "task.completed",
  MISSION_FAILED: "task.failed",
  MISSION_BLOCKED: "security.blocked",
  APPROVAL_APPROVED: "approval.approved",
  APPROVAL_REJECTED: "approval.rejected",
  ACTION_BLOCKED: "security.blocked",
  REVIEW_FAILED: "review.decision",
  REVENUE_GENERATED: "task.completed",
  OPPORTUNITY_VALIDATED: "task.completed",
} as const;
export function recordLearning(
  state: ExecutionState,
  type: LearningEventType,
  key: string,
  details: Partial<LearningEvent> = {},
  now = new Date(),
) {
  const runtime = (state.runtime ??= emptyRunnerState());
  const id = `learning:${type}:${key}`;
  if (runtime.learning.some((e) => e.id === id)) return;
  const mission = state.missions.find((m) => m.id === details.missionId);
  const event = createCompanyEvent({
    kind: kinds[type],
    department: "personal",
    actor: mission?.assignedAgentId ?? "system",
    action: mission?.title ?? type,
    outcome: /FAILED|BLOCKED|REJECTED/.test(type) ? "failure" : "success",
    traceId: mission?.traceId,
    humanIntervention: type === "APPROVAL_REJECTED",
    now,
  });
  runtime.learning.push({
    ...event,
    missionId: mission?.id,
    opportunityId: mission?.opportunityId,
    missionType: mission?.category,
    ...Object.fromEntries(
      Object.entries(details).filter(([, value]) => value !== undefined),
    ),
    id,
    type,
  });
}
