import type { ExecutionState } from "./store";
import type { AgentSummary } from "../organization";
import type { ExecutorResult } from "./executorTypes";
import { reviewActionRequest, canExecuteAfterApproval } from "./actionGateway";
import { runSecurityReview } from "./reviewer";
import { recordLearning } from "./learning";
import type { ActionExecutor } from "./executorTypes";
import { transition } from "./mission";
import { completionBlocker } from "./completion";
import { emptyRunnerState } from "./runnerConfig";

// Only exact, new Markdown artifact names in isolated working memory are accepted.
// They are records in execution storage, never arbitrary filesystem/Vault writes.
export function isSafeMemoryPath(path: unknown): path is string {
  return (
    typeof path === "string" &&
    /^memory\/(?:company-review|personal\/agent-results|patterns|organization-proposals)\/[a-zA-Z0-9_-]{1,100}\.md$/.test(
      path,
    )
  );
}
const registry: ReadonlyMap<string, ActionExecutor> = new Map([
  [
    "MISSION_STATUS_UPDATE",
    {
      actionType: "MISSION_STATUS_UPDATE",
      execute(request, { state, payload, now }) {
        const mission = state.missions.find((m) => m.id === request.missionId);
        if (!mission || !payload.status)
          return { status: "BLOCKED", reason: "INVALID_MISSION_STATUS" };
        if (payload.status === "COMPLETED") {
          const reason = completionBlocker(state, mission.id);
          if (reason) return { status: "BLOCKED", reason };
        }
        const moved = transition(mission, payload.status, {
          actor: request.requestedByAgentId,
          now,
        });
        if (!moved.ok) return { status: "BLOCKED", reason: moved.error };
        state.missions = state.missions.map((m) =>
          m.id === mission.id ? moved.mission : m,
        );
        return { status: "EXECUTED" };
      },
    },
  ],
  ...["INTERNAL_MEMORY_WRITE", "INTERNAL_REPORT_CREATE"].map(
    (actionType) =>
      [
        actionType,
        {
          actionType,
          execute(request, { state, payload, now }) {
            const reports = [
              "Mission Report",
              "Daily Report",
              "Agent Result",
              "Reviewer Result",
              "Learning Summary",
            ];
            const path =
              actionType === "INTERNAL_REPORT_CREATE"
                ? `memory/company-review/${request.id}.md`
                : payload.path;
            if (
              !isSafeMemoryPath(path) ||
              typeof payload.content !== "string" ||
              !payload.content.trim() ||
              payload.content.length > 50000 ||
              (actionType === "INTERNAL_REPORT_CREATE" &&
                !reports.includes(payload.reportType ?? ""))
            )
              return { status: "BLOCKED", reason: "INVALID_INTERNAL_ARTIFACT" };
            const runtime = (state.runtime ??= emptyRunnerState());
            if (runtime.artifacts.some((a) => a.path === path))
              return {
                status: "BLOCKED",
                reason: "APPEND_ONLY_ARTIFACT_EXISTS",
              };
            runtime.artifacts.push({
              id: request.id,
              missionId: request.missionId,
              agentId: request.requestedByAgentId,
              path,
              content: payload.content,
              createdAt: now.toISOString(),
            });
            return { status: "EXECUTED", outputId: request.id };
          },
        } satisfies ActionExecutor,
      ] as const,
  ),
]);
// No raw executor is exported: the caller can only inspect membership.
export const registeredActionTypes = (): string[] => [...registry.keys()];
export const hasExecutor = (actionType: string): boolean =>
  registry.has(actionType);

export function executeStoredAction(
  state: ExecutionState,
  actionRequestId: string,
  agent: AgentSummary | null,
  now = new Date(),
): ExecutorResult {
  const request = state.actionRequests.find((a) => a.id === actionRequestId);
  const runtime = (state.runtime ??= emptyRunnerState());
  const execution = runtime.executions.find(
    (e) => e.actionRequestId === actionRequestId,
  );
  if (!request || !execution)
    return { status: "BLOCKED", reason: "UNBOUND_ACTION" };
  if (execution.status === "EXECUTED") return execution;
  const fresh = reviewActionRequest({
    missionId: request.missionId,
    traceId: request.traceId,
    agent,
    actionType: request.actionType,
    origin: request.origin,
    payloadSummary: request.payloadSummary,
    target: request.target,
    now,
  });
  const finish = (result: ExecutorResult) => {
    Object.assign(execution, result, { at: now.toISOString() });
    if (["EXECUTED", "BLOCKED", "FAILED"].includes(result.status))
      request.status = result.status as "EXECUTED" | "BLOCKED" | "FAILED";
    request.reason = result.reason;
    request.updatedAt = now.toISOString();
    if (result.status === "BLOCKED")
      recordLearning(
        state,
        "ACTION_BLOCKED",
        request.id,
        {
          missionId: request.missionId,
          actionType: request.actionType,
          reason: result.reason,
        },
        now,
      );
    return result;
  };
  if (
    agent?.id !== request.requestedByAgentId ||
    fresh.request.status === "BLOCKED" ||
    ["REJECTED", "BLOCKED", "FAILED"].includes(request.status)
  )
    return finish({
      status: "BLOCKED",
      reason: fresh.request.reason ?? request.reason ?? "ACTION_DENIED",
    });
  const security = runSecurityReview({
    output: JSON.stringify(execution.payload),
    externalContent: JSON.stringify(execution.payload),
    now,
  });
  if (security.verdict !== "PASS")
    return finish({
      status: "BLOCKED",
      reason: security.findings
        .filter((f) => f.verdict !== "PASS")
        .map((f) => f.id)
        .join(","),
    });
  if (fresh.needsApproval) {
    const approval = state.approvals.find(
      (a) =>
        a.id === request.approvalId &&
        a.actionRequestId === request.id &&
        a.missionId === request.missionId,
    );
    if (!approval || approval.status === "PENDING")
      return finish({ status: "WAITING_APPROVAL" });
    const check = canExecuteAfterApproval(fresh.request, {
      approved: approval.status === "APPROVED",
      expiresAt: approval.expiresAt,
      now,
    });
    if (
      !check.executable ||
      !approval.expiresAt ||
      !Number.isFinite(Date.parse(approval.expiresAt))
    )
      return finish({
        status: "BLOCKED",
        reason: check.reason ?? "INVALID_APPROVAL",
      });
  } else if (request.status !== "AUTO_APPROVED")
    return finish({ status: "BLOCKED", reason: "INVALID_AUTO_APPROVAL" });
  const executor = registry.get(request.actionType);
  if (!executor)
    return finish({
      status:
        fresh.request.riskLevel === "R2" || fresh.request.riskLevel === "R3"
          ? "DRY_RUN"
          : "NO_EXECUTOR",
      reason: "APPROVED_NOT_EXECUTED: NO_EXECUTOR",
    });
  return finish(
    executor.execute(
      {
        ...request,
        status: fresh.needsApproval ? "APPROVED" : "AUTO_APPROVED",
      },
      { state, payload: execution.payload, now },
    ),
  );
}
