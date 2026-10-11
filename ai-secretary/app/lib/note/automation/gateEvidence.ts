import type { DailyXPlan, DailyXPlanSlot, ExecutionGateResult, ExecutionGateType, GateEvidence, SocialDraft } from "../research/types";

export type GateDecisionEvidence = {
  result: ExecutionGateResult;
  reasonCode: string;
  policyVersion: string;
};

export function buildGateEvidence(input: {
  gate: ExecutionGateType;
  decision?: GateDecisionEvidence;
  plan: DailyXPlan;
  slot: DailyXPlanSlot;
  draft: Pick<SocialDraft, "id">;
  evaluatedAt: string;
}): GateEvidence {
  const decision = input.decision ?? {
    result: "UNKNOWN" as const,
    reasonCode: `${input.gate}_EVIDENCE_UNAVAILABLE`,
    policyVersion: "unknown",
  };
  return {
    id: ["gate", input.gate.toLowerCase(), input.plan.id, input.slot.id, input.draft.id, input.evaluatedAt].join(":"),
    gateType: input.gate,
    ...decision,
    planId: input.plan.id,
    slotId: input.slot.id,
    draftId: input.draft.id,
    evaluatedAt: input.evaluatedAt,
    source: "daily-x-execution",
  };
}

export function appendGateEvidence(plan: DailyXPlan, evidence: GateEvidence): void {
  const current = plan.gateEvidence ?? [];
  if (!current.some((item) => item.id === evidence.id)) plan.gateEvidence = [...current, evidence];
}
