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

export type ExecutionStepStatus = "PENDING" | "RUNNING" | "COMPLETE" | "FAILED";

export type ExecutionStep = {
  id: string;
  order: number;
  title: string;
  type: ExecutionStepType;
  requiredSkillId?: string;
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
  steps: Omit<ExecutionStep, "id" | "status">[];
  expectedOutputs: string[];
  acceptanceCriteria?: import("./reviewer").QualityCriterion[];
  expectedArtifacts?: string[];
  constraints?: string[];
  now?: Date;
}): ExecutionPlan {
  const now = input.now ?? new Date();
  const steps: ExecutionStep[] = input.steps.map((step, index) => ({
    ...step,
    id: `step_${index + 1}`,
    status: "PENDING",
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
  };
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
  return defaultPlanSteps(objective).map(step => step.actionType === "PUBLISH_DRAFT" ? { ...step, actionType: "INTERNAL_REPORT_CREATE" } : step);
}
