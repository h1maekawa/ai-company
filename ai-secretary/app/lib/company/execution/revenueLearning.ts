import type { RevenueEntry } from "../revenueStore";
import { effectiveEntries } from "../revenueStore";
import { loadExecutionState, saveExecutionState } from "./store";
import { loadOpportunities, saveOpportunities } from "../opportunity/store";
import { validateOpportunityRevenue } from "../opportunity/lifecycle";
import { recordLearning } from "./learning";
export async function syncRevenueLearning(entries: RevenueEntry[]) {
  const state = await loadExecutionState();
  const before = await loadOpportunities();
  const after = validateOpportunityRevenue(before, entries);
  for (const entry of effectiveEntries(entries)) {
    if (
      !entry.confirmedByHuman ||
      entry.sourceType === "investment" ||
      entry.amountYen <= 0
    )
      continue;
    recordLearning(state, "REVENUE_GENERATED", entry.id, {
      revenueId: entry.id,
      revenueYen: entry.amountYen,
      missionId: entry.missionId,
      opportunityId: entry.opportunityId,
      actor: entry.originAgentId,
      skillId: entry.originSkillId,
      workflowId: entry.originWorkflowId,
      traceId: entry.originTraceId,
    });
  }
  for (const opportunity of after.filter((o) => o.status === "VALIDATED")) {
    recordLearning(state, "OPPORTUNITY_VALIDATED", opportunity.id, {
      opportunityId: opportunity.id,
      revenueYen: opportunity.realizedRevenueYen,
    });
  }
  await saveExecutionState(state);
  await saveOpportunities(after);
}
