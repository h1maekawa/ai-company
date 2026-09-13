import { reviewActionRequest, type GatewayInput } from "./actionGateway";
import { createApprovalRequest } from "./approval";
import type { ExecutionState } from "./store";
import type { InternalActionPayload } from "./executorTypes";
import { emptyRunnerState } from "./runnerConfig";
import { runSecurityReview } from "./reviewer";
import { executeStoredAction } from "./executorRegistry";
export { executeStoredAction } from "./executorRegistry";
export function submitAction(
  state: ExecutionState,
  input: GatewayInput,
  payload: InternalActionPayload = {},
) {
  const decision = reviewActionRequest(input);
  const request = decision.request;
  const runtime = (state.runtime ??= emptyRunnerState());
  // Bind immutable payload before CEO review; no payload can be supplied at resume.
  let bound = JSON.parse(JSON.stringify(payload)) as InternalActionPayload;
  const security = runSecurityReview({
    output: JSON.stringify(bound),
    externalContent: JSON.stringify(bound),
  });
  if (security.verdict !== "PASS") {
    request.status = "BLOCKED";
    request.reason = security.findings
      .filter((f) => f.verdict !== "PASS")
      .map((f) => f.id)
      .join(",");
    request.payloadSummary = "[REDACTED: SECURITY_REVIEW]";
    bound = {};
  }
  if (decision.needsApproval && security.verdict === "PASS") {
    const approval = createApprovalRequest({
      actionRequestId: request.id,
      title: input.actionType,
      summary: JSON.stringify(bound),
      riskLevel: request.riskLevel,
      requestedBy: request.requestedByAgentId,
      missionId: request.missionId,
      now: input.now,
    });
    request.approvalId = approval.id;
    state.approvals.push(approval);
  }
  state.actionRequests.push(request);
  const mission = state.missions.find((m) => m.id === input.missionId);
  if (mission) mission.actionRequestIds.push(request.id);
  runtime.executions.push({
    actionRequestId: request.id,
    payload: bound,
    status: "WAITING_APPROVAL",
    at: request.createdAt,
  });
  return {
    request,
    result: executeStoredAction(state, request.id, input.agent, input.now),
  };
}
