import type { AgentSummary } from "../organization";
import type { ExecutionMission } from "../execution/mission";
import type { ExecutionState } from "../execution/store";
import { getSkillById } from "../../skills/registry";

export const AUTONOMOUS_INTERNAL_ACTIONS = new Set([
  "MISSION_STATUS_UPDATE",
  "INTERNAL_MEMORY_WRITE",
  "INTERNAL_REPORT_CREATE",
]);

export type AutonomousEligibility =
  | { eligible: true; agent: AgentSummary }
  | { eligible: false; reason: string };

/** Fail-closed gate applied before an autonomous mission obtains its lease. */
export function autonomousEligibility(
  state: ExecutionState,
  mission: ExecutionMission,
  agents: AgentSummary[],
): AutonomousEligibility {
  if (!["ACTIVE", "EXECUTING", "REVIEWING", "REPLAN_REQUIRED"].includes(mission.status))
    return { eligible: false, reason: "MISSION_NOT_STARTED" };
  if (state.approvals.some((approval) => approval.missionId === mission.id && approval.status === "PENDING"))
    return { eligible: false, reason: "PENDING_APPROVAL" };

  const agent = agents.find((candidate) => candidate.id === mission.assignedAgentId);
  if (!agent) return { eligible: false, reason: "ASSIGNED_AGENT_NOT_FOUND" };
  if (agent.riskLevel === "R4") return { eligible: false, reason: "R4_AGENT_FORBIDDEN" };

  const plan = state.plans.find((candidate) => candidate.id === mission.executionPlanId);
  if (!plan || plan.missionId !== mission.id || plan.agentId !== agent.id || plan.steps.length === 0)
    return { eligible: false, reason: "VALID_EXECUTION_PLAN_REQUIRED" };
  const blockedPlanAction = plan.steps.find(
    (step) => step.actionType && !AUTONOMOUS_INTERNAL_ACTIONS.has(step.actionType),
  );
  if (blockedPlanAction)
    return { eligible: false, reason: `NON_INTERNAL_ACTION:${blockedPlanAction.actionType}` };
  const priorExternalAction = state.actionRequests.find(
    (request) => request.missionId === mission.id && !AUTONOMOUS_INTERNAL_ACTIONS.has(request.actionType),
  );
  if (priorExternalAction)
    return { eligible: false, reason: `NON_INTERNAL_ACTION_REQUEST:${priorExternalAction.actionType}` };

  for (const step of plan.steps) {
    if (!step.requiredSkillId) continue;
    const skill = getSkillById(step.requiredSkillId);
    if (
      !skill ||
      skill.status !== "implemented" ||
      !agent.skillIds.includes(step.requiredSkillId) ||
      !skill.allowedSecretaries.includes(agent.id)
    )
      return { eligible: false, reason: `SKILL_NOT_EXECUTABLE:${step.requiredSkillId}` };
  }
  return { eligible: true, agent };
}
