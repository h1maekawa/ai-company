import {
  dispositionFromLegacyAction,
  type InvestmentDecisionOutcome,
  type InvestmentDecisionReview,
  type InvestmentLearning,
  type InvestmentLearningDecision,
  type ReviewHumanDecision,
  type ReviewRecommendation,
} from "./types";

export function createInvestmentDecisionOutcome(input: {
  id: string;
  decisionId: string;
  recommendationId: string;
  ticker: string;
  horizon: InvestmentDecisionOutcome["horizon"];
  observedAt: string;
  referencePriceAtDecision?: number | null;
  observedPrice?: number | null;
  thesisStatus?: InvestmentDecisionOutcome["thesisStatus"];
  source: InvestmentDecisionOutcome["source"];
  notes?: string | null;
}): InvestmentDecisionOutcome {
  const reference = finitePositive(input.referencePriceAtDecision);
  const observed = finitePositive(input.observedPrice);
  return {
    id: input.id,
    decisionId: input.decisionId,
    recommendationId: input.recommendationId,
    ticker: input.ticker.toUpperCase(),
    horizon: input.horizon,
    observedAt: input.observedAt,
    referencePriceAtDecision: reference,
    observedPrice: observed,
    priceChangePct: reference !== null && observed !== null
      ? Math.round(((observed - reference) / reference) * 10000) / 100
      : null,
    thesisStatus: input.thesisStatus ?? null,
    source: input.source,
    notes: input.notes ?? null,
    metricKind: "PRICE_OBSERVATION",
  };
}

function finitePositive(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : null;
}

export function buildInvestmentDecisionReviews(input: {
  recommendations: ReviewRecommendation[];
  decisions: ReviewHumanDecision[];
  outcomes: InvestmentDecisionOutcome[];
  learnings: InvestmentLearning[];
}): InvestmentDecisionReview[] {
  const recById = new Map(input.recommendations.map((item) => [item.id, item]));
  return input.decisions.map((decision) => {
    const recommendation = decision.recommendationId
      ? recById.get(decision.recommendationId) ?? null
      : null;
    const outcomes = input.outcomes
      .filter((item) => item.decisionId === decision.id)
      .sort((a, b) => a.observedAt.localeCompare(b.observedAt));
    const learnings = input.learnings.filter((item) => item.sourceDecisionIds.includes(decision.id));
    const latest = outcomes[outcomes.length - 1];
    return {
      recommendation,
      humanDecision: decision,
      decision,
      outcomes,
      learnings,
      comparison: {
        recommendationDirection: recommendation?.decision ?? null,
        humanDisposition: decision.disposition ?? dispositionFromLegacyAction(decision.action) ?? null,
        latestPriceChangePct: latest?.priceChangePct ?? null,
      },
    };
  });
}

export function effectiveInvestmentLearnings(
  candidates: InvestmentLearning[],
  decisions: InvestmentLearningDecision[]
): InvestmentLearning[] {
  const latest = new Map<string, InvestmentLearningDecision>();
  for (const decision of [...decisions].sort((a, b) => a.decidedAt.localeCompare(b.decidedAt))) {
    latest.set(decision.learningId, decision);
  }
  return candidates.map((candidate) => {
    const human = latest.get(candidate.id);
    if (!human) return candidate;
    return {
      ...candidate,
      status: human.decision,
      approvedAt: human.decision === "approved" ? human.decidedAt : undefined,
    };
  });
}

/** 将来のDecision Supportへ渡せるのは本人承認済みだけ。今回はRecommendationへ未接続。 */
export function approvedInvestmentLearnings(
  learnings: InvestmentLearning[]
): InvestmentLearning[] {
  return learnings.filter((learning) => learning.status === "approved");
}

/**
 * 同じ理由・時間軸のObservationだけをまとめる。単発の相場結果による過学習を避け、
 * 1〜2件はlow、3〜6件はmedium、highは独立した7件以上がある場合だけに限定する。
 */
export function createInvestmentLearningCandidate(
  reviews: InvestmentDecisionReview[],
  now = new Date()
): InvestmentLearning {
  if (reviews.length === 0) throw new Error("LEARNING_REQUIRES_REVIEW");
  const outcomes = reviews.flatMap((review) => review.outcomes);
  if (outcomes.length === 0) throw new Error("LEARNING_REQUIRES_OUTCOME");
  const horizons = new Set(outcomes.map((outcome) => outcome.horizon));
  if (horizons.size !== 1) throw new Error("MIXED_OUTCOME_HORIZONS_FORBIDDEN");
  const horizon = outcomes[0].horizon;
  const recommendationHorizons = new Set(
    reviews.map((review) => review.recommendation?.horizon).filter(Boolean)
  );
  if (recommendationHorizons.size > 1) throw new Error("MIXED_RECOMMENDATION_HORIZONS_FORBIDDEN");
  const commonTags = reviews
    .map((review) => new Set(review.humanDecision.reasonTags ?? []))
    .reduce<string[]>((common, tags, index) =>
      index === 0 ? [...tags] : common.filter((tag) => tags.has(tag)), []);
  if (reviews.length > 1 && commonTags.length === 0) {
    throw new Error("DISSIMILAR_DECISION_REASONS_FORBIDDEN");
  }
  const sampleSize = reviews.length;
  const confidence = sampleSize >= 7 ? "high" : sampleSize >= 3 ? "medium" : "low";
  const observations = reviews.map((review) => {
    const outcome = review.outcomes[review.outcomes.length - 1]!;
    const disposition = review.comparison.humanDisposition ?? "UNMAPPED_LEGACY";
    const tags = review.humanDecision.reasonTags?.join(",") || "untagged";
    return `${review.humanDecision.ticker} ${review.comparison.recommendationDirection ?? "NO_RECOMMENDATION"} / Human ${disposition} / ${tags} / ${horizon} ${outcome.priceChangePct ?? "N/A"}%`;
  });
  const dominantTag = commonTags[0] ?? reviews
    .flatMap((review) => review.humanDecision.reasonTags ?? [])
    .find(Boolean) ?? "other";
  return {
    id: `investment-learning-${now.getTime()}`,
    sourceDecisionIds: reviews.map((review) => review.humanDecision.id),
    sourceRecommendationIds: reviews
      .map((review) => review.recommendation?.id)
      .filter((id): id is string => Boolean(id)),
    sourceOutcomeIds: outcomes.map((outcome) => outcome.id),
    horizon,
    recommendationHorizon: [...recommendationHorizons][0] ?? null,
    sampleSize,
    observation: observations.join(" | "),
    interpretation: `${horizon}の${dominantTag}判断について、同種ケースで有効性を検証する価値がある可能性`,
    proposedPrinciple: `${horizon}では${dominantTag}を独立した反対材料として確認する`,
    confidence,
    status: "candidate",
    createdAt: now.toISOString(),
  };
}
