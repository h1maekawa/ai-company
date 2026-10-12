/**
 * Horizon Intelligence (PR-C): SHORT / MID / LONG assessments of an existing InvestmentOpportunity.
 *
 * Additive only. The existing single `InvestmentOpportunity.score`/`gate` stay the primary,
 * backward-compatible signal; these types attach alongside it, never replace it.
 */

export type InvestmentHorizon = "SHORT" | "MID" | "LONG";

export type HorizonGate = "GO_CANDIDATE" | "WAIT" | "PASS" | "DATA_INCOMPLETE";

export type HorizonFactor = {
  key: string;
  label: string;
  weight: number;
  /** 0-100, normalized within this single factor. null means missing, never a guessed 0. */
  score: number | null;
  /** score * weight / 100 — this factor's point contribution to the 0-100 horizon score. */
  weightedScore: number | null;
  known: boolean;
  evidenceRefs: string[];
  reason: string | null;
};

export type HorizonAssessment = {
  horizon: InvestmentHorizon;
  score: number | null;
  coverage: number;
  gate: HorizonGate;
  confidence: number | null;
  factors: HorizonFactor[];
  bullCase: string | null;
  baseCase: string | null;
  bearCase: string | null;
  risks: string[];
  invalidationConditions: string[];
  evidenceRefs: string[];
  generatedAt: string;
};

export type TripleGate =
  | "TRIPLE_GO"
  | "MID_LONG_GO"
  | "SHORT_ONLY"
  | "LONG_ONLY"
  | "MIXED"
  | "NO_GO"
  | "DATA_INCOMPLETE";
