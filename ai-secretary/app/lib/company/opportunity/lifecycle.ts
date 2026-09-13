import type { RevenueOpportunity } from "./types";
import type { RevenueEntry } from "../revenueStore";
import { effectiveEntries } from "../revenueStore";
export function selectOpportunity(
  opportunity: RevenueOpportunity,
  now = new Date(),
): RevenueOpportunity {
  if (opportunity.status === "SELECTED") return opportunity;
  if (opportunity.status !== "RECOMMENDED")
    throw new Error("OPPORTUNITY_NOT_RECOMMENDED");
  return { ...opportunity, status: "SELECTED", updatedAt: now.toISOString() };
}
export function startOpportunity(
  opportunity: RevenueOpportunity,
  now = new Date(),
): RevenueOpportunity {
  if (opportunity.status === "RUNNING" || opportunity.status === "VALIDATED")
    return opportunity;
  if (opportunity.status !== "SELECTED")
    throw new Error("OPPORTUNITY_NOT_SELECTED");
  return { ...opportunity, status: "RUNNING", updatedAt: now.toISOString() };
}
export function validateOpportunityRevenue(
  opportunities: RevenueOpportunity[],
  revenue: RevenueEntry[],
  now = new Date(),
) {
  const confirmed = effectiveEntries(revenue).filter(
    (e) =>
      e.confirmedByHuman && e.sourceType !== "investment" && e.amountYen > 0,
  );
  return opportunities.map((o) => {
    const linked = confirmed.filter((e) => e.opportunityId === o.id);
    const amount = linked.reduce((sum, e) => sum + e.amountYen, 0);
    return {
      ...o,
      status:
        amount > 0 && ["RUNNING", "VALIDATED"].includes(o.status)
          ? ("VALIDATED" as const)
          : o.status === "VALIDATED" && amount === 0
            ? ("RUNNING" as const)
            : o.status,
      realizedRevenueYen: amount,
      validatedByMissionIds: [
        ...new Set(linked.flatMap((e) => (e.missionId ? [e.missionId] : []))),
      ],
      updatedAt: now.toISOString(),
    };
  });
}
