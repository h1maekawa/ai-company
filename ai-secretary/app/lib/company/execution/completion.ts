import type { ExecutionState } from "./store";
export function completionBlocker(
  state: ExecutionState,
  missionId: string,
): string | undefined {
  const mission = state.missions.find((m) => m.id === missionId);
  const plan = state.plans.find((p) => p.id === mission?.executionPlanId);
  if (
    !plan ||
    !plan.steps.length ||
    plan.steps.some((s) => s.status !== "COMPLETE")
  )
    return "REQUIRED_STEPS_INCOMPLETE";
  const run = state.runtime?.runs[missionId];
  if (run?.review?.verdict !== "PASS") return "REQUIRED_REVIEW_NOT_PASSED";
  for (const step of plan.steps.filter((s) => s.type === "action")) {
    const h = [...run.history]
      .reverse()
      .find(
        (h) =>
          h.planId === plan.id && h.stepId === step.id && h.actionRequestId,
      );
    const action = state.actionRequests.find(
      (a) => a.id === h?.actionRequestId,
    );
    if (!action || action.status !== "EXECUTED")
      return "REQUIRED_ACTION_NOT_EXECUTED";
  }
  if (
    state.approvals.some(
      (a) => a.missionId === missionId && a.status === "PENDING",
    )
  )
    return "APPROVAL_PENDING";
  if (
    state.actionRequests.some(
      (a) =>
        a.missionId === missionId &&
        ["BLOCKED", "FAILED", "WAITING_APPROVAL", "REQUESTED"].includes(
          a.status,
        ),
    )
  )
    return "BLOCKING_ACTION";
}
