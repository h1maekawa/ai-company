/**
 * Next Content Engine — 承認済みLearningから次の投稿候補を機械的に導く。
 * AIの自由生成ではなく、承認済みデータからの決定的な変換にとどめる
 * （Learning自体の解釈にはすでに人の承認が入っているため）。
 */

import type { ContentGoal } from "../../note/research/types";
import { ContentRecommendation, createRecommendation, Learning } from "./types";

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
