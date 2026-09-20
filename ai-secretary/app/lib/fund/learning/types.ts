import type { Confidence, FundDecision } from "../engine";
import type { Horizon } from "../policy";

export type LegacyDecisionAction = "acknowledged" | "bought" | "skipped" | "trimmed" | "sold";

export type HumanDecisionDisposition = "ACCEPT" | "REJECT" | "DEFER" | "MODIFY";
export type IntendedInvestmentAction = "BUY" | "ADD" | "HOLD" | "TRIM" | "EXIT" | "WAIT";

/** 最小限の初期集合。slug形式の追加タグも許可し、巨大な固定Ontologyにしない。 */
export const SUGGESTED_DECISION_REASON_TAGS = [
  "valuation", "growth", "fcf", "roic", "earnings", "market_environment",
  "concentration", "theme_exposure", "risk_reward", "technical", "volume",
  "liquidity", "timing", "thesis", "new_catalyst", "portfolio_balance",
  "insufficient_data", "other",
] as const;
export type HumanDecisionReasonTag = string;

export type RecommendationDecisionSnapshot = {
  decision: FundDecision;
  score: number;
  confidence: Confidence;
  horizon: Horizon;
  dataAsOf: string;
  policyVersion: number;
};

export type OutcomeHorizon = "1W" | "1M" | "3M" | "6M";
export type ThesisStatus = "MAINTAINED" | "WEAKENED" | "INVALIDATED" | "UNKNOWN";

/** 振り返り用の市場Observation。売買実績・Realized P/Lではない。 */
export type InvestmentDecisionOutcome = {
  id: string;
  decisionId: string;
  recommendationId: string;
  ticker: string;
  horizon: OutcomeHorizon;
  observedAt: string;
  referencePriceAtDecision: number | null;
  observedPrice: number | null;
  priceChangePct: number | null;
  thesisStatus: ThesisStatus | null;
  source: "market_data" | "manual";
  notes: string | null;
  /** Realized P/Lではないことを機械可読に固定する。 */
  metricKind: "PRICE_OBSERVATION";
};

export type InvestmentLearning = {
  id: string;
  sourceDecisionIds: string[];
  sourceRecommendationIds: string[];
  sourceOutcomeIds: string[];
  horizon: OutcomeHorizon;
  recommendationHorizon: Horizon | null;
  sampleSize: number;
  observation: string;
  interpretation: string;
  proposedPrinciple: string | null;
  confidence: "low" | "medium" | "high";
  status: "candidate" | "approved" | "rejected";
  createdAt: string;
  approvedAt?: string;
};

export type InvestmentLearningDecision = {
  id: string;
  learningId: string;
  decision: "approved" | "rejected";
  decidedAt: string;
  confirmedByHuman: true;
};

export type InvestmentDecisionReview = {
  recommendation: ReviewRecommendation | null;
  humanDecision: ReviewHumanDecision;
  /** 既存UI contractの互換alias。 */
  decision: ReviewHumanDecision;
  outcomes: InvestmentDecisionOutcome[];
  learnings: InvestmentLearning[];
  comparison: {
    recommendationDirection: FundDecision | null;
    humanDisposition: HumanDecisionDisposition | null;
    latestPriceChangePct: number | null;
  };
};

export type ReviewRecommendation = {
  id: string;
  ticker: string;
  horizon: Horizon;
  decision: FundDecision;
  score: number;
  confidence: Confidence;
  dataAsOf: string;
  policyVersion: number;
};

export type ReviewHumanDecision = {
  id: string;
  recommendationId: string | null;
  ticker: string;
  action: LegacyDecisionAction | null;
  disposition?: HumanDecisionDisposition;
  reason?: string | null;
  reasonTags?: HumanDecisionReasonTag[];
  intendedAction?: IntendedInvestmentAction | null;
  reasonSource?: "HUMAN_CONFIRMED";
  note: string | null;
  amountJpy: number | null;
  shares: number | null;
  decidedAt: string;
};

/** acknowledgedは採用を意味しないため変換しない。 */
export function dispositionFromLegacyAction(
  action: LegacyDecisionAction | null | undefined
): HumanDecisionDisposition | undefined {
  // bought/skipped等だけでは、元提案をそのまま採用したか、数量変更や延期だったか
  // 判別できない。legacy actionは表示可能なFactとして残し、dispositionを推測しない。
  void action;
  return undefined;
}

export function isReasonTag(value: unknown): value is string {
  return typeof value === "string" && /^[a-z][a-z0-9_]{0,39}$/.test(value);
}
