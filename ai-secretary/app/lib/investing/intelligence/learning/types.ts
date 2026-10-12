/**
 * Investment Learning (PR-E).
 *
 * Correlates PR-C's HorizonFactor scores (frozen on the Decision Snapshot — never recomputed)
 * with PR-E's Decision Performance outcomes. Output is always a *proposal*: nothing in this
 * module, or anywhere else in the codebase, writes a scoring weight or gate threshold.
 * Applying a change is exclusively a human-reviewed PR to the weight tables in
 * app/lib/investing/intelligence/horizon/{shortScore,midScore,longScore}.ts.
 *
 * Correlation != Causation: a factor correlating with return does not mean that factor caused
 * the return. `correlation` is reported as a plain Pearson coefficient for a human to interpret,
 * never translated into a causal claim by this code.
 */

import type { InvestmentHorizon } from "../horizon/types";

export type FactorPerformance = {
  horizon: InvestmentHorizon;
  factorKey: string;

  sampleSize: number;
  averageFactorScore: number | null;
  averageReturn: number | null;
  /** Pearson correlation of factor score vs. return, in [-1, 1]. Correlation != Causation. */
  correlation: number | null;
  winRate: number | null;

  status: "VALID" | "INSUFFICIENT_SAMPLE" | "DATA_INCOMPLETE";
};

export type LearningCandidateConfidence = "LOW" | "MEDIUM" | "HIGH";
export type LearningCandidateStatus = "OBSERVE" | "REVIEW_CANDIDATE" | "INSUFFICIENT_SAMPLE";

export type InvestmentLearningCandidate = {
  horizon: InvestmentHorizon;
  factorKey: string;

  /** Read from the live SHORT_SCORE_WEIGHTS/MID_SCORE_WEIGHTS/LONG_SCORE_WEIGHTS tables — never a second copy of the weight. */
  currentWeight: number;
  /** A bounded proposal; null unless sampleSize meets MINIMUM_LEARNING_SAMPLE. Never applied automatically. */
  proposedWeight: number | null;

  evidence: string[];
  sampleSize: number;
  confidence: LearningCandidateConfidence;
  status: LearningCandidateStatus;
  /** Always true — exists so a consumer can never destructure this away or treat it as optional. */
  requiresHumanReview: true;
};

export type InvestmentLearningReport = {
  generatedAt: string;
  factorPerformances: FactorPerformance[];
  candidates: InvestmentLearningCandidate[];
};
