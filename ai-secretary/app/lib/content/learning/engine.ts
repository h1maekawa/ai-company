/**
 * Next Content Engine — 承認済みLearningから次の投稿候補を機械的に導く。
 * AIの自由生成ではなく、承認済みデータからの決定的な変換にとどめる
 * （Learning自体の解釈にはすでに人の承認が入っているため）。
 */

import type { ContentGoal } from "../../note/research/types";
import { ContentRecommendation, createRecommendation, Learning } from "./types";
import type { CreatorDemandEvidence } from "../evidence/types";

export type RecommendationChannel = ContentRecommendation["channel"];

/**
 * 承認済み（approved）のLearningだけを対象に、actionCandidateがあるものを
 * ContentRecommendationへ変換する。却下・未承認のLearningからは生成しない。
 */
export function generateRecommendationsFromLearnings(
  learnings: Learning[],
  options: { channel?: RecommendationChannel; contentGoal?: ContentGoal } = {}
): ContentRecommendation[] {
  return learnings
    .filter((l) => l.status === "approved" && l.actionCandidate)
    .map((l, index) =>
      createRecommendation({
        sourceLearningIds: [l.id],
        channel: options.channel ?? "note",
        topic: l.actionCandidate as string,
        contentGoal: options.contentGoal,
        reason: l.interpretation,
        evidence: [l.observation],
        priority: l.confidence === "high" ? 1 : l.confidence === "medium" ? 2 : 3 + index * 0,
      })
    );
}

/** Observed値だけをObservationへ置き、AI解釈はcandidateのまま返す。 */
export function createDemandLearningCandidate(
  evidence: CreatorDemandEvidence,
  interpretation: string,
  actionCandidate: string
): Learning {
  const observed = [
    evidence.impressions === undefined ? null : `impressions=${evidence.impressions}`,
    evidence.engagements === undefined ? null : `engagements=${evidence.engagements}`,
    evidence.linkClicks === undefined ? null : `linkClicks=${evidence.linkClicks}`,
    evidence.relativeScore === undefined ? null : `past-X-percentile=${evidence.relativeScore}`,
  ].filter((value): value is string => value !== null);
  return {
    id: `learn_demand_${evidence.sourcePerformanceId}`,
    period: evidence.capturedAt.slice(0, 10),
    sourceContentIds: [evidence.sourcePublishedContentId],
    sourcePerformanceIds: [evidence.sourcePerformanceId],
    observation: observed.join(" / ") || "観測可能なDemand指標なし",
    interpretation,
    confidence: evidence.status === "OBSERVED" ? "medium" : "low",
    actionCandidate,
    status: "candidate",
    createdAt: evidence.capturedAt,
  };
}
