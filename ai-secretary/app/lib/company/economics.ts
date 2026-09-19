/**
 * Creator Economic Outcome read model。
 * Company Revenue Ledger + Business Cost Ledgerから都度導出し、Mission等へ書き戻さない。
 */

import { effectiveEntries, type RevenueEntry } from "./revenueStore";
import {
  effectiveBusinessCostEntries,
  type BusinessCostEntry,
} from "./businessCost";

export type EconomicDataStatus = "CONFIRMED" | "PARTIAL" | "UNKNOWN";

export type EconomicScope =
  | { type: "all" }
  | { type: "mission"; id: string }
  | { type: "opportunity"; id: string }
  | { type: "content"; id: string }
  | { type: "knowledge"; id: string }
  | { type: "business"; id: string };

export type EconomicOutcome = {
  scope: EconomicScope;
  revenueYen: number | null;
  directRevenueYen: number | null;
  assistedRevenueYen: number | null;
  costYen: number | null;
  profitYen: number | null;
  roi: number | null;
  revenueStatus: EconomicDataStatus;
  costStatus: EconomicDataStatus;
  confirmedRevenueEntries: number;
  confirmedCostEntries: number;
};

export type ProjectEconomicOutcomeInput = {
  revenueEntries: RevenueEntry[];
  costEntries: BusinessCostEntry[];
  scope?: EconomicScope;
  /** 締め処理等で「Entryなし=確認済み0円」と分かる場合だけtrue */
  revenueKnown?: boolean;
  /** 締め処理等で「Entryなし=確認済み0円」と分かる場合だけtrue */
  costKnown?: boolean;
};

function matchesScope(
  entry: {
    missionId?: string;
    opportunityId?: string;
    contentId?: string;
    sourceKnowledgeId?: string;
    businessId?: string;
  },
  scope: EconomicScope
): boolean {
  if (scope.type === "all") return true;
  if (scope.type === "mission") return entry.missionId === scope.id;
  if (scope.type === "opportunity") return entry.opportunityId === scope.id;
  if (scope.type === "content") return entry.contentId === scope.id;
  if (scope.type === "knowledge") return entry.sourceKnowledgeId === scope.id;
  return entry.businessId === scope.id;
}

function dataStatus(
  rawEntries: { confirmedByHuman: boolean }[],
  confirmedCount: number,
  explicitlyKnown: boolean
): EconomicDataStatus {
  const hasUnconfirmed = rawEntries.some((entry) => !entry.confirmedByHuman);
  if (hasUnconfirmed) return "PARTIAL";
  if (confirmedCount > 0 || explicitlyKnown) return "CONFIRMED";
  return "UNKNOWN";
}

export function projectEconomicOutcome(
  input: ProjectEconomicOutcomeInput
): EconomicOutcome {
  const scope = input.scope ?? { type: "all" as const };
  const scopedRevenue = input.revenueEntries
    .filter((entry) => entry.sourceType !== "investment")
    .filter((entry) => matchesScope(entry, scope));
  const scopedCosts = input.costEntries.filter((entry) => matchesScope(entry, scope));

  // 未確認の修正・取消で確認済み実績を変えない。未確認データの存在はPARTIALで示す。
  const confirmedRevenue = effectiveEntries(
    scopedRevenue.filter((entry) => entry.confirmedByHuman)
  ).filter((entry) => entry.sourceType !== "investment");
  const confirmedCosts = effectiveBusinessCostEntries(
    scopedCosts.filter((entry) => entry.confirmedByHuman)
  );

  const revenueStatus = dataStatus(
    scopedRevenue,
    confirmedRevenue.length,
    input.revenueKnown === true
  );
  const costStatus = dataStatus(
    scopedCosts,
    confirmedCosts.length,
    input.costKnown === true
  );

  const directRevenue = confirmedRevenue
    .filter((entry) => entry.attributionType !== "assisted")
    .reduce((sum, entry) => sum + entry.amountYen, 0);
  const assistedRevenue = confirmedRevenue
    .filter((entry) => entry.attributionType === "assisted")
    .reduce((sum, entry) => sum + entry.amountYen, 0);
  const confirmedRevenueYen = directRevenue + assistedRevenue;
  const confirmedCostYen = confirmedCosts.reduce(
    (sum, entry) => sum + entry.amountYen,
    0
  );

  const revenueYen = revenueStatus === "UNKNOWN" ? null : confirmedRevenueYen;
  const directRevenueYen = revenueStatus === "UNKNOWN" ? null : directRevenue;
  const assistedRevenueYen = revenueStatus === "UNKNOWN" ? null : assistedRevenue;
  const costYen = costStatus === "UNKNOWN" ? null : confirmedCostYen;
  const complete = revenueStatus === "CONFIRMED" && costStatus === "CONFIRMED";
  const profitYen = complete ? confirmedRevenueYen - confirmedCostYen : null;
  const roi = complete && confirmedCostYen > 0 ? profitYen! / confirmedCostYen : null;

  return {
    scope,
    revenueYen,
    directRevenueYen,
    assistedRevenueYen,
    costYen,
    profitYen,
    roi,
    revenueStatus,
    costStatus,
    confirmedRevenueEntries: confirmedRevenue.length,
    confirmedCostEntries: confirmedCosts.length,
  };
}
