import type { AgentSummary } from "../organization";
import type { ExecutionState } from "./store";
import type { ExecutionStep } from "./executionPlan";
import { transition, type FullMissionStatus } from "./mission";
import {
  emptyMissionRun,
  emptyRunnerState,
  runnerLimits,
} from "./runnerConfig";
import type { RunnerLimits } from "./runnerTypes";
import { submitAction, executeStoredAction } from "./executeAction";
import { recordLearning } from "./learning";
import { runReviewPipeline, runSecurityReview } from "./reviewer";
import { completionBlocker } from "./completion";
import { executeMissionSkill } from "../../skills/missionRuntime";
import { createContentDraftCandidate } from "./contentHandoff";
import { discoverSkillCandidates } from "../evolution/skillCandidates";
import { listSkills } from "../../skills/registry";

export type StepWorker = (input: {
  objective: string;
  context: string;
  step: ExecutionStep;
  rejectionReason?: string;
  signal: AbortSignal;
  agentId?: string;
}) => Promise<string>;
export async function runAgent(
  state: ExecutionState,
  missionId: string,
  agent: AgentSummary | null,
  worker: StepWorker,
  options: Partial<RunnerLimits> = {},
  checkpoint?: (state: ExecutionState) => Promise<void>,
  availableAgents: AgentSummary[] = agent ? [agent] : [],
) {
  const limits = runnerLimits(options);
  const runtime = (state.runtime ??= emptyRunnerState());
  const run = (runtime.runs[missionId] ??= emptyMissionRun());
  run.modelCalls ??= 0;
  let mission = state.missions.find((m) => m.id === missionId);
  if (!mission) throw new Error("MISSION_NOT_FOUND");
  if (["COMPLETED", "CANCELLED", "FAILED", "BLOCKED"].includes(mission.status))
    return state;
  const move = (status: FullMissionStatus, reason?: string) => {
    const moved = transition(mission!, status, {
      actor: agent?.id ?? "system",
      reason,
    });
    if (!moved.ok) throw new Error(moved.error);
    mission = moved.mission;
    state.missions = state.missions.map((m) =>
      m.id === missionId ? mission! : m,
    );
  };
  const stop = (reason: string, status: "BLOCKED" | "FAILED" = "FAILED") => {
    run.stopReason = reason;
    move(status, reason);
    recordLearning(
      state,
      status === "BLOCKED" ? "MISSION_BLOCKED" : "MISSION_FAILED",
      `${missionId}:${run.replans}`,
      { missionId, reason },
    );
  };
  if (!agent || mission.assignedAgentId !== agent.id) {
    stop("NO_SUITABLE_AGENT", "BLOCKED");
    return state;
  }
  let plan = state.plans.find((p) => p.id === mission!.executionPlanId);
  if (
    !plan ||
    plan.agentId !== agent.id ||
    plan.missionId !== missionId ||
    !plan.steps.length
  ) {
    stop("INVALID_EXECUTION_PLAN");
    return state;
  }
  if (mission.status === "REPLAN_REQUIRED") {
    if (run.replans >= limits.maxReplans) {
      stop("MAX_REPLANS");
      return state;
    }
    run.replans++;
    const rejected = state.actionRequests.filter(
      (a) => a.missionId === missionId && a.status === "REJECTED",
    );
    run.rejectionReason =
      rejected
        .map((a) => a.reason)
        .filter(Boolean)
        .join("; ") || run.stopReason;
    run.rejectedProposals = [
      ...new Set([
        ...run.rejectedProposals,
        ...rejected.map((a) => a.payloadSummary),
      ]),
    ];
    plan = {
      ...plan,
      id: `${plan.id}_replan${run.replans}`,
      steps: plan.steps.map((s) => ({
        ...s,
        status: "PENDING",
      })),
    };
    state.plans.push(plan);
    mission.executionPlanId = plan.id;
    run.review = undefined;
    move("EXECUTING", run.rejectionReason);
  } else if (mission.status === "ACTIVE") move("EXECUTING");
  else if (
    !["EXECUTING", "REVIEWING", "WAITING_APPROVAL"].includes(mission.status)
  ) {
    run.stopReason = "MISSION_NOT_ACTIVE";
    return state;
  }
  const started = Date.now();
  const controller = new AbortController();
  const remaining = limits.maxExecutionTime - run.elapsedMs;
  if (remaining <= 0) {
    stop("MAX_EXECUTION_TIME");
    return state;
  }
  const timer = setTimeout(() => controller.abort(), remaining);
  const bounded = <T>(promise: Promise<T>): Promise<T> =>
    new Promise((resolve, reject) => {
      const abort = () => reject(new Error("MAX_EXECUTION_TIME"));
      if (controller.signal.aborted) {
        abort();
        return;
      }
      controller.signal.addEventListener("abort", abort, { once: true });
      promise
        .then(resolve, reject)
        .finally(() => controller.signal.removeEventListener("abort", abort));
    });
  try {
    for (const step of [...plan.steps].sort((a, b) => a.order - b.order)) {
      if (step.status === "COMPLETE") continue;
      const dependenciesComplete = (step.dependsOn ?? []).every((dependencyId) => plan!.steps.some((candidate) => candidate.id === dependencyId && candidate.status === "COMPLETE"));
      if (!dependenciesComplete) continue;
      if (step.humanRequired) {
        const contentCandidate = state.contentDraftCandidates.find((candidate) => candidate.parentMissionId === missionId && candidate.status !== "REJECTED");
        if (plan.workflowKind === "CREATOR_MULTI_AGENT" && !contentCandidate) {
          step.status = "BLOCKED";
          stop("CONTENT_DRAFT_CANDIDATE_REQUIRED", "BLOCKED");
          break;
        }
        const priorHumanReview = [...run.history].reverse().find((item) => item.planId === plan!.id && item.stepId === step.id && item.actionRequestId);
        const priorRequest = priorHumanReview?.actionRequestId ? state.actionRequests.find((request) => request.id === priorHumanReview.actionRequestId) : undefined;
        if (priorRequest?.status === "APPROVED") {
          step.status = "COMPLETE";
          step.updatedAt = new Date().toISOString();
          step.outputRefs = [`approval:${priorRequest.approvalId}`];
          priorHumanReview!.status = "COMPLETE";
          priorHumanReview!.outputRefs = step.outputRefs;
          if (mission.status === "WAITING_APPROVAL") move("EXECUTING", "CEO Human Review approved; no publication executed");
          continue;
        }
        if (priorRequest?.status === "REJECTED") {
          step.status = "BLOCKED";
          if (mission.status === "WAITING_APPROVAL") move("REPLAN_REQUIRED", "CEO Human Review rejected");
          break;
        }
        if (!priorRequest) {
          const reviewAgent = availableAgents.find((candidate) => candidate.id === (step.assignedAgentId ?? "personal-note")) ?? agent;
          const submitted = submitAction(state, { missionId, traceId: mission.traceId ?? "unknown", agent: reviewAgent, actionType: "PUBLISH_DRAFT", payloadSummary: "Creator Draft Human Review (approval does not publish)", origin: "agent", target: contentCandidate ? `content-candidate:${contentCandidate.id}` : undefined }, { reportType: "Reviewer Result", content: "Review the referenced Creator draft. Approval records acceptance only and performs no publication." });
          const approval = state.approvals.find((item) => item.id === submitted.request.approvalId);
          if (approval && contentCandidate) {
            approval.title = `✍️ ${contentCandidate.contentType} Draftが完成しました`;
            approval.summary = contentCandidate.title ?? contentCandidate.body.slice(0, 120);
          }
          run.history.push({ planId: plan.id, stepId: step.id, at: new Date().toISOString(), status: "WAITING_APPROVAL", actionRequestId: submitted.request.id, agentId: reviewAgent?.id, inputRefs: step.inputRefs, outputRefs: [], knowledgeRefs: step.knowledgeRefs });
        }
        step.status = "WAITING";
        step.updatedAt = new Date().toISOString();
        if (mission.status !== "WAITING_APPROVAL") move("WAITING_APPROVAL", "CREATOR_HUMAN_REVIEW_REQUIRED");
        break;
      }
      const stepAgent = step.assignedAgentId ? availableAgents.find((candidate) => candidate.id === step.assignedAgentId) ?? null : agent;
      if (!stepAgent) {
        step.status = "BLOCKED";
        stop(`NO_SUITABLE_AGENT:${step.assignedAgentId ?? "unknown"}`, "BLOCKED");
        break;
      }
      if (run.steps >= limits.maxSteps) {
        stop("MAX_STEPS");
        break;
      }
      if (controller.signal.aborted) {
        stop("MAX_EXECUTION_TIME");
        break;
      }
      if (
        step.requiredSkillId &&
        !stepAgent.skillIds.includes(step.requiredSkillId)
      ) {
        stop("MISSING_SKILL", "BLOCKED");
        break;
      }
      const old = [...run.history]
        .reverse()
        .find(
          (h) =>
            h.planId === plan!.id && h.stepId === step.id && h.actionRequestId,
        );
      if (mission.status === "WAITING_APPROVAL" && !old) break;
      if (
        old &&
        state.approvals.some(
          (a) =>
            a.actionRequestId === old.actionRequestId &&
            a.status === "PENDING" &&
            (!a.expiresAt || Date.parse(a.expiresAt) > Date.now()),
        )
      )
        break;
      run.steps++;
      step.status = "RUNNING";
      step.updatedAt = new Date().toISOString();
      const history = {
        planId: plan.id,
        stepId: step.id,
        at: new Date().toISOString(),
        status: "RUNNING",
        output: undefined as string | undefined,
        reason: undefined as string | undefined,
        actionRequestId: old?.actionRequestId,
        agentId: stepAgent.id,
        inputRefs: step.inputRefs,
        outputRefs: step.outputRefs,
        knowledgeRefs: step.knowledgeRefs,
      };
      run.history.push(history);
      if (checkpoint) await bounded(checkpoint(state));
      const dependencyIds = new Set(step.dependsOn ?? []);
      const priorContext = run.history
        .filter((h) => h.planId === plan!.id && h.output && (!dependencyIds.size || dependencyIds.has(h.stepId)))
        .map((h) => h.output)
        .join("\n")
        .slice(-10000);
      const referenceContext = (plan.referenceContext ?? []).filter((reference) => (step.knowledgeRefs ?? []).includes(reference.id)).map((reference) => `[${reference.source}:${reference.id}] ${reference.excerpt}`).join("\n").slice(0, 4000);
      const context = `${referenceContext}\n${priorContext}`.trim();
      try {
        if (step.requiredSkillId) {
          const skill = await bounded(executeMissionSkill({
            skillId: step.requiredSkillId,
            agentId: stepAgent.id,
            agentSkillIds: stepAgent.skillIds,
            objective: plan.objective,
            context,
          }));
          if (!skill.ok || !skill.markdown) {
            history.status = "BLOCKED";
            history.reason = skill.error ?? "SKILL_EXECUTION_FAILED";
            step.status = "FAILED";
            stop(history.reason, "BLOCKED");
            break;
          }
          history.output = skill.markdown;
        } else if (step.type === "action") {
          if (!step.actionType) throw new Error("MISSING_ACTION_TYPE");
          const payload = step.payload ?? {
            reportType: "Mission Report" as const,
            content: context,
          };
          const proposal = JSON.stringify(payload);
          if (!old && run.rejectedProposals.includes(proposal)) {
            stop("REJECTED_PROPOSAL_UNCHANGED");
            break;
          }
          const submitted = old
            ? {
                request: state.actionRequests.find(
                  (a) => a.id === old.actionRequestId,
                )!,
                result: executeStoredAction(state, old.actionRequestId!, stepAgent),
              }
            : submitAction(
                state,
                {
                  missionId,
                  traceId: mission.traceId ?? "unknown",
                  agent: stepAgent,
                  actionType: step.actionType,
                  payloadSummary: proposal,
                  origin: "agent",
                  target: payload.path,
                },
                payload,
              );
          history.actionRequestId = submitted.request.id;
          if (submitted.result.status === "WAITING_APPROVAL") {
            history.status = "WAITING_APPROVAL";
            step.status = "PENDING";
            if (mission.status !== "WAITING_APPROVAL") move("WAITING_APPROVAL");
            break;
          }
          if (submitted.result.status !== "EXECUTED") {
            history.status = submitted.result.status;
            history.reason = submitted.result.reason;
            step.status = "FAILED";
            stop(submitted.result.reason ?? submitted.result.status, "BLOCKED");
            break;
          }
          // Status executors may replace the mission in the shared state.
          mission = state.missions.find((m) => m.id === missionId)!;
          if (mission.status === "WAITING_APPROVAL")
            move("EXECUTING", "承認後に再開");
        } else if (step.type === "review") {
          if (mission.status === "EXECUTING") move("REVIEWING");
          run.review = runReviewPipeline({
            quality: {
              objective: plan.objective,
              output: context,
              expectedOutputs: plan.expectedOutputs,
              expectedArtifacts: plan.expectedArtifacts,
              acceptanceCriteria: plan.acceptanceCriteria,
            },
            security: { output: context, externalContent: context },
          });
          (run.reviewHistory ??= []).push(run.review);
          if (!run.review.canProceed) {
            recordLearning(
              state,
              "REVIEW_FAILED",
              `${missionId}:${run.replans}:${step.id}`,
              { missionId, reason: run.review.verdict },
            );
            throw new Error("REVIEW_FAILED");
          }
        } else {
          if (run.modelCalls >= limits.maxModelCalls) {
            stop("MAX_MODEL_CALLS");
            break;
          }
          const safety = runSecurityReview({
            output: `${mission.title} ${mission.description ?? ""} ${context}`,
            externalContent: context,
          });
          if (safety.verdict !== "PASS") {
            stop("security.injection_or_sensitive", "BLOCKED");
            break;
          }
          run.modelCalls++;
          const output = await bounded(
            worker({
              objective: plan.objective,
              context: `${mission.description ?? ""}\n${context}`,
              step: { ...step },
              rejectionReason: run.rejectionReason,
              signal: controller.signal,
              agentId: stepAgent.id,
            }),
          );
          if (controller.signal.aborted) throw new Error("MAX_EXECUTION_TIME");
          if (!output.trim() || output.length > 50000)
            throw new Error("INVALID_STEP_OUTPUT");
          if (
            runSecurityReview({ output, externalContent: output }).verdict !==
            "PASS"
          ) {
            stop("security.injection_or_sensitive", "BLOCKED");
            break;
          }
          history.output = output;
          step.outputRefs = [`mission:${missionId}:step:${step.id}:output`];
          history.outputRefs = step.outputRefs;
        }
        step.status = "COMPLETE";
        step.updatedAt = new Date().toISOString();
        history.status = "COMPLETE";
        if (plan.workflowKind === "CREATOR_MULTI_AGENT" && step.id === "creator_lead_review") {
          const contentHistory = [...run.history].reverse().find((item) => item.planId === plan!.id && item.stepId === "creator_content" && item.status === "COMPLETE" && item.output);
          if (!contentHistory?.output) throw new Error("CONTENT_OUTPUT_REQUIRED");
          const contentStep = plan.steps.find((item) => item.id === "creator_content");
          const researchStep = plan.steps.find((item) => item.id === "creator_research");
          const kpiStep = plan.steps.find((item) => item.id === "creator_kpi");
          const candidate = createContentDraftCandidate({
            parentMissionId: missionId,
            objective: plan.objective,
            body: contentHistory.output,
            sourceKnowledgeIds: contentStep?.knowledgeRefs,
            sourceResearchRefs: researchStep?.outputRefs,
            sourceKpiRefs: kpiStep?.outputRefs,
            sourceStepId: "creator_content",
            createdByAgentId: contentHistory.agentId,
          });
          const index = state.contentDraftCandidates.findIndex((item) => item.id === candidate.id);
          if (index >= 0) state.contentDraftCandidates[index] = { ...candidate, createdAt: state.contentDraftCandidates[index].createdAt };
          else state.contentDraftCandidates.push(candidate);
          step.outputRefs = [...new Set([...(step.outputRefs ?? []), `content-candidate:${candidate.id}`])];
          history.outputRefs = step.outputRefs;
        }
        if (checkpoint) await bounded(checkpoint(state));
      } catch (error) {
        const message = error instanceof Error ? error.message : "STEP_FAILED";
        const reason = [
          "MAX_EXECUTION_TIME",
          "REVIEW_FAILED",
          "INVALID_STEP_OUTPUT",
          "MISSING_ACTION_TYPE",
        ].includes(message)
          ? message
          : "STEP_FAILED";
        history.status = "FAILED";
        history.reason = reason;
        step.status = "FAILED";
        run.stopReason = reason;
        if (reason === "MAX_EXECUTION_TIME") stop(reason);
        else if (
          run.retries < limits.maxRetries &&
          run.replans < limits.maxReplans
        ) {
          run.retries++;
          move("REPLAN_REQUIRED", reason);
        } else stop("RETRY_OR_REPLAN_LIMIT");
        break;
      }
    }
    if (
      plan.steps.every((s) => s.status === "COMPLETE") &&
      !["BLOCKED", "FAILED", "COMPLETED"].includes(mission.status)
    ) {
      if (mission.status === "EXECUTING") move("REVIEWING");
      const reason = completionBlocker(state, missionId);
      if (reason) stop(reason);
      else {
        const { result } = submitAction(
          state,
          {
            missionId,
            traceId: mission.traceId ?? "unknown",
            agent,
            actionType: "MISSION_STATUS_UPDATE",
            payloadSummary: "Mission completion",
            origin: "agent",
          },
          { status: "COMPLETED" },
        );
        if (result.status !== "EXECUTED")
          stop(result.reason ?? "COMPLETION_DENIED", "BLOCKED");
        else {
          mission = state.missions.find((m) => m.id === missionId)!;
          mission.completedAt = new Date().toISOString();
          recordLearning(state, "MISSION_SUCCEEDED", missionId, {
            missionId,
            latencyMs: run.elapsedMs + Date.now() - started,
            reviewScore: 100,
            costUnknownReason: "Provider usage not reported",
            tools: plan.steps.map((s) => s.type),
          });
          if (plan.workflowKind === "CREATOR_MULTI_AGENT") state.skillCandidates = discoverSkillCandidates(state, listSkills());
        }
      }
    }
  } finally {
    clearTimeout(timer);
    controller.abort();
    run.elapsedMs += Date.now() - started;
  }
  return state;
}
