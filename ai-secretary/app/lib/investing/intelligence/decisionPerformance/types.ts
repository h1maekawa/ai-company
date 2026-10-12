/**
 * Decision Performance (PR-E).
 *
 * Measures not "how did the holding do" but "how did that day's GO/WAIT/PASS judgment turn
 * out" — reusing the existing Decision Store (`InvestmentDecisionRecord`,
 * app/lib/investing/intelligence/store.ts) rather than a second one. Every field here is
 * *derived* from the existing record plus later-dated price data fetched for this purpose only;
 * nothing is persisted as a new store (see loader.ts).
 *
 * Returns are percentages (e.g. 4.2 means +4.2%), matching the existing convention used by
 * `priceChangePct`/`pnlPct`/`momentumPct` elsewhere in this codebase — never a 0-1 fraction.
 */

import type { HorizonGate, TripleGate } from "../horizon/types";

export type DecisionPerformance = {
  decisionId: string;
  ticker: string;

  decision: "GO" | "WAIT" | "PASS";
  decisionPrice: number | null;
  decisionAt: string;

  /** Copied from the Decision Snapshot (InvestmentDecisionRecord.*Snapshot) — never recomputed. */
  shortGate: HorizonGate | null;
  midGate: HorizonGate | null;
  longGate: HorizonGate | null;
  tripleGate: TripleGate | null;

  return1d: number | null;
  return5d: number | null;
  return20d: number | null;
  return60d: number | null;
  return120d: number | null;
  return250d: number | null;

  /** Positive magnitude (how far below decisionPrice), never negative. */
  maxDrawdown20d: number | null;
  maxDrawdown60d: number | null;
  /** Positive magnitude (how far above decisionPrice). */
  maxGain20d: number | null;
  maxGain60d: number | null;

  /** Latest bar date actually used to compute the fields above; null when nothing could be computed. */
  evaluatedThrough: string | null;
  /** VALID once decisionPrice, ticker, and at least some bars are available; otherwise DATA_INCOMPLETE. */
  dataStatus: "VALID" | "DATA_INCOMPLETE";
  updatedAt: string;
};

export type ReturnField = "return1d" | "return5d" | "return20d" | "return60d" | "return120d" | "return250d";
export type DrawdownField = "maxDrawdown20d" | "maxDrawdown60d";
export type GainField = "maxGain20d" | "maxGain60d";

export type DecisionPerformanceSummary = {
  sampleSize: number;
  winRate: number | null;
  averageReturn: number | null;
  medianReturn: number | null;
  /** Equal to averageReturn: without a position-size/stake model, EV of % return is the average % return. Kept as a separate named field for readability. */
  expectedValue: number | null;
  averageMaxDrawdown: number | null;
  averageMaxGain: number | null;
  riskRewardRatio: number | null;
  status: "VALID" | "INSUFFICIENT_SAMPLE" | "DATA_INCOMPLETE";
};

export const MINIMUM_LEARNING_SAMPLE = 30;
export const RECOMMENDED_LEARNING_SAMPLE = 100;

export type DecisionPerformanceSegments = {
  byDecision: Partial<Record<"GO" | "WAIT" | "PASS", DecisionPerformanceSummary>>;
  byShortGate: Partial<Record<HorizonGate, DecisionPerformanceSummary>>;
  byMidGate: Partial<Record<HorizonGate, DecisionPerformanceSummary>>;
  byLongGate: Partial<Record<HorizonGate, DecisionPerformanceSummary>>;
  byTripleGate: Partial<Record<TripleGate, DecisionPerformanceSummary>>;
};

export type DecisionPerformanceReport = {
  generatedAt: string;
  performances: DecisionPerformance[];
  /** Overall summary uses return20d (see summary.ts); segments pick the window matching their dimension. */
  summary: DecisionPerformanceSummary;
  segments: DecisionPerformanceSegments;
};
