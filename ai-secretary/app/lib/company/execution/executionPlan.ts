/**
 * Execution Plan — Phase 6 §12 / §13
 *
 * Mission開始後、Agentはいきなり実行しない。先に計画を出す。
 * 何をするつもりかを先に見せることで、
 * 実行前に「それは違う」と止められるようにする。
 */

import type { RiskLevel } from "../agentTypes";
import { riskOf, type ActionType } from "./actionTypes";

export type ExecutionStepType = "analysis" | "research" | "generate" | "review" | "action";

export type ExecutionStepStatus = "PENDING" | "RUNNING" | "WAITING" | "COMPLETE" | "BLOCKED" | "FAILED";

export type ExecutionStep = {
  id: string;
  order: number;
  title: string;
  type: ExecutionStepType;
  requiredSkillId?: string;
  assignedAgentId?: string;
  dependsOn?: string[];
  inputRefs?: string[];
  outputRefs?: string[];
  knowledgeRefs?: string[];
  humanRequired?: boolean;
  updatedAt?: string;
  /** action ステップのみ。Gatewayへ出すAction */
  actionType?: ActionType;
  payload?: import("./executorTypes").InternalActionPayload;
  status: ExecutionStepStatus;
};

export type ExecutionPlan = {
  id: string;
  missionId: string;
  traceId: string;
  agentId: string;
  leadAgentId?: string;
  departmentId?: string;
  workflowKind?: "CREATOR_MULTI_AGENT";
  maxParallel?: number;
  referenceContext?: Array<{ id: string; excerpt: string; source: "knowledge" | "step" | "ssot" }>;
  objective: string;
  steps: ExecutionStep[];
  expectedOutputs: string[];
  /** Additive contract for deterministic Mission completion checks. */
  acceptanceCriteria?: import("./reviewer").QualityCriterion[];
  expectedArtifacts?: string[];
  constraints?: string[];
  /** 計画に含まれるActionのうち最も高いリスク */
  riskLevel: RiskLevel;
  createdAt: string;
  updatedAt?: string;
};

const RISK_ORDER: Record<RiskLevel, number> = { R0: 0, R1: 1, R2: 2, R3: 3, R4: 4 };

/** 計画全体のリスクは、含まれるActionの最大値にする */
export function planRiskLevel(steps: ExecutionStep[]): RiskLevel {
  const risks = steps
    .filter((step) => step.actionType)
    .map((step) => riskOf(step.actionType as string));
  if (risks.length === 0) return "R0";
  return risks.reduce((worst, risk) => (RISK_ORDER[risk] > RISK_ORDER[worst] ? risk : worst));
}

export function createExecutionPlan(input: {
  missionId: string;
  traceId: string;
  agentId: string;
  objective: string;
  steps: Array<Omit<ExecutionStep, "id" | "status"> & { id?: string }>;
  expectedOutputs: string[];
  acceptanceCriteria?: import("./reviewer").QualityCriterion[];
  expectedArtifacts?: string[];
  constraints?: string[];
  now?: Date;
}): ExecutionPlan {
  const now = input.now ?? new Date();
  const steps: ExecutionStep[] = input.steps.map((step, index) => ({
    ...step,
    id: step.id ?? `step_${index + 1}`,
    status: "PENDING",
    updatedAt: now.toISOString(),
  }));

  return {
    id: `plan_${now.getTime().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
    missionId: input.missionId,
    traceId: input.traceId,
    agentId: input.agentId,
    objective: input.objective,
    steps,
    expectedOutputs: input.expectedOutputs,
    acceptanceCriteria: input.acceptanceCriteria,
    expectedArtifacts: input.expectedArtifacts,
    constraints: input.constraints,
    riskLevel: planRiskLevel(steps),
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
  };
}

/** Dependencyを満たした実行可能Stepだけを返す。並列数は2以下に固定する。 */
export function readyExecutionSteps(plan: ExecutionPlan): ExecutionStep[] {
  const completed = new Set(plan.steps.filter((step) => step.status === "COMPLETE").map((step) => step.id));
  const limit = Math.min(Math.max(plan.maxParallel ?? 1, 1), 2);
  return plan.steps
    .filter((step) => step.status === "PENDING" && (step.dependsOn ?? []).every((id) => completed.has(id)))
    .sort((a, b) => a.order - b.order)
    .slice(0, limit);
}

/**
 * 既定の計画。
 * 実行そのものはPhase 6の範囲外なので、
 * 「調べる → 作る → 見直す → 下書きを出す」までの骨格に留める。
 */
export function defaultPlanSteps(
  objective: string
): Omit<ExecutionStep, "id" | "status">[] {
  return [
    { order: 1, title: "必要な材料を集める", type: "research" },
    { order: 2, title: `${objective}の草案を作る`, type: "generate" },
    { order: 3, title: "目的とのズレを確認する", type: "review" },
    // 下書きまで。送信・公開はここに含めない（§19）
    { order: 4, title: "下書きとして保存する", type: "action", actionType: "PUBLISH_DRAFT" },
  ];
}

export function currentStep(plan: ExecutionPlan): ExecutionStep | null {
  return plan.steps.find((s) => s.status === "RUNNING" || s.status === "PENDING") ?? null;
}

export function planProgress(plan: ExecutionPlan): number {
  if (plan.steps.length === 0) return 0;
  const done = plan.steps.filter((s) => s.status === "COMPLETE").length;
  return Math.round((done / plan.steps.length) * 100);
}

/** Phase 7 creates an internal draft artifact; no publishing step is implied. */
export function internalPlanSteps(objective: string): Omit<ExecutionStep, "id" | "status">[] {
  return defaultPlanSteps(objective).map(step =>
    step.actionType === "PUBLISH_DRAFT"
      ? { ...step, title: "内部レポートとして保存する", actionType: "INTERNAL_REPORT_CREATE" }
      : step,
  );
}
