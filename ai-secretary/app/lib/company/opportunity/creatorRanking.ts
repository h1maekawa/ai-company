import { projectEconomicOutcome, type EconomicOutcome } from "../economics";
import type { BusinessCostEntry } from "../businessCost";
import type { RevenueEntry } from "../revenueStore";
import type { RevenueOpportunity } from "./types";

// 1〜2件の偶然でCreator戦略を変えないため、相対Economic評価には最低5件を要求する。
export const MIN_ECONOMIC_RANKING_SAMPLES = 5;

function percentile(value: number, baseline: number[]): number {
  return baseline.filter((candidate) => candidate <= value).length / baseline.length;
}

function evidenceStatus(outcome: EconomicOutcome): "CONFIRMED" | "PARTIAL" | "UNKNOWN" {
  if (outcome.revenueStatus === "PARTIAL" || outcome.costStatus === "PARTIAL") return "PARTIAL";
  if (outcome.revenueStatus === "CONFIRMED" && outcome.costStatus === "CONFIRMED") {
    return "CONFIRMED";
  }
  return "UNKNOWN";
}

export function applyCreatorDecisionRanking(input: {
  opportunities: RevenueOpportunity[];
  revenueEntries: RevenueEntry[];
  costEntries: BusinessCostEntry[];
}): RevenueOpportunity[] {
  const outcomes = new Map<string, EconomicOutcome>();
  for (const opportunity of input.opportunities) {
    const knowledgeId = opportunity.sourceKnowledge?.id;
    if (!knowledgeId || outcomes.has(knowledgeId)) continue;
    outcomes.set(
      knowledgeId,
      projectEconomicOutcome({
        revenueEntries: input.revenueEntries,
        costEntries: input.costEntries,
        scope: { type: "knowledge", id: knowledgeId },
      })
    );
  }

  const confirmed = [...outcomes.values()].filter(
    (outcome) => evidenceStatus(outcome) === "CONFIRMED" && outcome.profitYen !== null
  );
  const profits = confirmed.map((outcome) => outcome.profitYen as number);
  const rois = confirmed
    .map((outcome) => outcome.roi)
    .filter((roi): roi is number => roi !== null);

  const ranked = input.opportunities.map((opportunity) => {
    const knowledgeId = opportunity.sourceKnowledge?.id;
    if (!knowledgeId) return opportunity;
    const outcome = outcomes.get(knowledgeId)!;
    const status = evidenceStatus(outcome);
    const enoughSamples = confirmed.length >= MIN_ECONOMIC_RANKING_SAMPLES;
    const economicParts: number[] = [];
    if (status === "CONFIRMED" && enoughSamples && outcome.profitYen !== null) {
      economicParts.push(percentile(outcome.profitYen, profits) * 100);
      if (outcome.roi !== null && rois.length >= MIN_ECONOMIC_RANKING_SAMPLES) {
        economicParts.push(percentile(outcome.roi, rois) * 100);
      }
    }
    const economicScore = economicParts.length > 0
      ? Math.round(economicParts.reduce((sum, value) => sum + value, 0) / economicParts.length)
      : undefined;
    const demandScore = opportunity.creatorDemand?.score;
    const demandWeight =
      demandScore === undefined
        ? 0
        : (opportunity.creatorDemand!.coveragePct / 100) *
          Math.min(1, opportunity.creatorDemand!.evidenceCount / 3);
    const economicCoverage = Math.min(
      1,
      (outcome.confirmedRevenueEntries + outcome.confirmedCostEntries) / 4
    );
    const economicWeight = economicScore === undefined ? 0 : economicCoverage * 0.75;
    const rankingScore = Math.round(
      (opportunity.score +
        (demandScore ?? 0) * demandWeight +
        (economicScore ?? 0) * economicWeight) /
        (1 + demandWeight + economicWeight)
    );

    return {
      ...opportunity,
      rankingScore,
      economicEvidence: {
        status,
        revenueYen: outcome.revenueYen,
        costYen: outcome.costYen,
        profitYen: outcome.profitYen,
        roi: outcome.roi,
        sourceScope: "knowledge" as const,
        confirmedRevenueEntries: outcome.confirmedRevenueEntries,
        confirmedCostEntries: outcome.confirmedCostEntries,
      },
      rankingBreakdown: {
        baseScore: opportunity.score,
        demandScore,
        demandWeight,
        economicScore,
        economicWeight,
        economicRankingStatus:
          status === "CONFIRMED"
            ? enoughSamples
              ? "CONFIRMED" as const
              : "INSUFFICIENT_DATA" as const
            : status,
        economicSampleSize: confirmed.length,
      },
    };
  });

  const creators = ranked
    .filter((opportunity) => opportunity.sourceKnowledge)
    .sort((a, b) => (b.rankingScore ?? b.score) - (a.rankingScore ?? a.score));
  const rankById = new Map(creators.map((opportunity, index) => [opportunity.id, index + 1]));
  return ranked.map((opportunity) => ({
    ...opportunity,
    creatorRank: rankById.get(opportunity.id),
  }));
}

/** Ledger由来の値をOpportunity Storeへ正本のように永続化しない。 */
export function withoutCreatorDecisionReadModel(
  opportunity: RevenueOpportunity
): RevenueOpportunity {
  const {
    economicEvidence: _economicEvidence,
    rankingBreakdown: _rankingBreakdown,
    creatorRank: _creatorRank,
    rankingScore: _rankingScore,
    ...persistent
  } = opportunity;
  return persistent;
}
