import { LONG_SCORE_WEIGHTS } from "../horizon/longScore";
import { MID_SCORE_WEIGHTS } from "../horizon/midScore";
import { SHORT_SCORE_WEIGHTS } from "../horizon/shortScore";
import type { InvestmentHorizon } from "../horizon/types";
import { MINIMUM_LEARNING_SAMPLE, RECOMMENDED_LEARNING_SAMPLE } from "../decisionPerformance/types";
import type { FactorPerformance, InvestmentLearningCandidate, LearningCandidateConfidence } from "./types";

/** |correlation| at or above this is "notable enough to ask a human to look at," not a threshold that changes anything by itself. */
const NOTABLE_CORRELATION = 0.2;
/** Bounds how far a proposal may suggest moving a weight in one pass — a nudge, never a rewrite. */
const MAX_PROPOSED_SHIFT = 0.3;

const WEIGHTS_FOR_HORIZON: Record<InvestmentHorizon, Record<string, number>> = {
  SHORT: SHORT_SCORE_WEIGHTS,
  MID: MID_SCORE_WEIGHTS,
  LONG: LONG_SCORE_WEIGHTS,
};

function confidenceFor(sampleSize: number): LearningCandidateConfidence {
  if (sampleSize >= RECOMMENDED_LEARNING_SAMPLE) return "HIGH";
  if (sampleSize >= 30) return "MEDIUM";
  return "LOW";
}

/**
 * Turns Factor Performance into a human-reviewable proposal. `requiresHumanReview: true` is not
 * decorative — no function anywhere in this codebase reads a LearningCandidate and writes it
 * into SHORT_SCORE_WEIGHTS/MID_SCORE_WEIGHTS/LONG_SCORE_WEIGHTS. Applying a change is a separate,
 * human-authored PR to those tables.
 */
export function buildLearningCandidates(factorPerformances: FactorPerformance[]): InvestmentLearningCandidate[] {
  return factorPerformances.map((item): InvestmentLearningCandidate => {
    const currentWeight = WEIGHTS_FOR_HORIZON[item.horizon][item.factorKey] ?? 0;

    if (item.status !== "VALID") {
      return {
        horizon: item.horizon, factorKey: item.factorKey, currentWeight, proposedWeight: null,
        evidence: [`sampleSize=${item.sampleSize}（最低${MINIMUM_LEARNING_SAMPLE}未満のため提案不可）`],
        sampleSize: item.sampleSize, confidence: "LOW", status: "INSUFFICIENT_SAMPLE", requiresHumanReview: true,
      };
    }

    const correlation = item.correlation ?? 0;
    const notable = Math.abs(correlation) >= NOTABLE_CORRELATION;
    const shift = Math.max(-MAX_PROPOSED_SHIFT, Math.min(MAX_PROPOSED_SHIFT, correlation));
    const evidence = [
      `sampleSize=${item.sampleSize}`,
      `correlation=${item.correlation ?? "N/A"}（correlation ≠ causation）`,
      `averageReturn=${item.averageReturn ?? "N/A"}%`,
      `averageFactorScore=${item.averageFactorScore ?? "N/A"}`,
    ];

    return {
      horizon: item.horizon,
      factorKey: item.factorKey,
      currentWeight,
      proposedWeight: notable ? Math.round(currentWeight * (1 + shift) * 100) / 100 : null,
      evidence,
      sampleSize: item.sampleSize,
      confidence: confidenceFor(item.sampleSize),
      status: notable ? "REVIEW_CANDIDATE" : "OBSERVE",
      requiresHumanReview: true,
    };
  });
}
