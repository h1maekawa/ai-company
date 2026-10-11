import type { DailyXPlan, DailyXPlanSlot, ExecutionGateResult, ExecutionGateType } from "../../note/research/types";
import type { ObservationValue } from "./types";

const RESULTS = new Set<ExecutionGateResult>(["PASS", "FAIL", "BLOCKED", "UNKNOWN"]);

function latestResult(plan: DailyXPlan, slot: DailyXPlanSlot, draftId: string, gateType: ExecutionGateType): ObservationValue {
  const matched = (plan.gateEvidence ?? []).filter((evidence) =>
    evidence.gateType === gateType && evidence.planId === plan.id && evidence.slotId === slot.id && evidence.draftId === draftId
  ).sort((a, b) => b.evaluatedAt.localeCompare(a.evaluatedAt));
  const result = matched[0]?.result;
  return result && RESULTS.has(result) ? result : "UNKNOWN";
}

/** Reads only exact plan/slot/draft lineage. Missing or mismatched evidence is never inferred. */
export function readGateEvidence(plan: DailyXPlan, slot: DailyXPlanSlot, draftId?: string | null) {
  if (!draftId) return { safety: "UNKNOWN", fact: "UNKNOWN", publishEligibility: "UNKNOWN" } as const;
  return {
    safety: latestResult(plan, slot, draftId, "SAFETY"),
    fact: latestResult(plan, slot, draftId, "FACT"),
    publishEligibility: latestResult(plan, slot, draftId, "PUBLISH_ELIGIBILITY"),
  };
}
