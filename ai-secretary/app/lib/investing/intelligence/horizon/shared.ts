import type { DailyBar } from "../../../fund/marketData/calc";
import { momentumPct } from "../../../fund/analyst";
import type { InvestmentOpportunity, ScoreFactor } from "../types";
import type { HorizonAssessment, HorizonFactor, HorizonGate, InvestmentHorizon } from "./types";

export const clamp = (min: number, max: number, value: number) => Math.max(min, Math.min(max, value));
const round2 = (value: number) => Math.round(value * 100) / 100;

/** Rescales an existing ScoreFactor (0..weight) onto the 0-100 single-factor scale, reused as-is. */
export function rescaleExistingFactor(breakdown: ScoreFactor[], key: ScoreFactor["key"]): { score: number; reason: string } | null {
  const existing = breakdown.find((factor) => factor.key === key);
  if (!existing || existing.score === null || existing.weight === 0) return null;
  return { score: clamp(0, 100, (existing.score / existing.weight) * 100), reason: existing.reason };
}

export function buildFactor(key: string, label: string, weight: number, raw: { score: number; reason: string; evidenceRefs?: string[] } | null): HorizonFactor {
  if (raw === null) return { key, label, weight, score: null, weightedScore: null, known: false, evidenceRefs: [], reason: null };
  const score = clamp(0, 100, raw.score);
  return { key, label, weight, score, weightedScore: round2((score * weight) / 100), known: true, evidenceRefs: raw.evidenceRefs ?? [], reason: raw.reason };
}

/**
 * Ticker 20-trading-day momentum minus SPY's own 20-day momentum (both via the existing
 * `momentumPct` from app/lib/fund/analyst.ts). This is the Relative Strength signal reused by
 * both SHORT and MID — no new ticker-level relative-strength provider is introduced.
 */
export function relativeStrength20d(tickerBars: DailyBar[] | null, spyBars: DailyBar[] | null): number | null {
  if (!tickerBars || !spyBars) return null;
  const tickerMomentum = momentumPct(tickerBars, 20);
  const spyMomentum = momentumPct(spyBars, 20);
  if (tickerMomentum === null || spyMomentum === null) return null;
  return tickerMomentum - spyMomentum;
}

const CRITICAL_RISK = (opportunity: InvestmentOpportunity) => opportunity.riskFlags.some((flag) => flag.severity === "critical");

function deriveGate(score: number | null, coverage: number, hasMandatoryEvidence: boolean, hasCriticalRisk: boolean): HorizonGate {
  const complete = coverage >= 0.8 && score !== null && hasMandatoryEvidence;
  if (!complete) return "DATA_INCOMPLETE";
  if (score! >= 75 && !hasCriticalRisk) return "GO_CANDIDATE";
  if (score! >= 55) return "WAIT";
  return "PASS";
}

/**
 * Aggregates factors into one HorizonAssessment. Shared by SHORT/MID/LONG so the scoring rule
 * (sum of known weightedScores, coverage = known weight / 100, gate thresholds, critical-risk
 * block) is defined exactly once rather than three times. Bull/Base/Bear and invalidation reuse
 * the existing `InvestmentOpportunity.scenarios` — no new scenario generator is introduced.
 */
export function buildAssessment(horizon: InvestmentHorizon, factors: HorizonFactor[], opportunity: InvestmentOpportunity, now: Date): HorizonAssessment {
  const known = factors.filter((factor) => factor.known);
  const coverage = round2(known.reduce((sum, factor) => sum + factor.weight, 0) / 100);
  const score = known.length === 0 ? null : Math.round(known.reduce((sum, factor) => sum + (factor.weightedScore ?? 0), 0));
  const distinctSources = new Set(opportunity.evidence.map((item) => item.sourceName)).size;
  const sourceDiversityFactor = distinctSources >= 2 ? 1 : distinctSources === 1 ? 0.8 : 0.6;
  const confidence = coverage === 0 ? null : round2(coverage * sourceDiversityFactor);
  const hasCriticalRisk = CRITICAL_RISK(opportunity);
  const gate = deriveGate(score, coverage, opportunity.missingEvidence.length === 0, hasCriticalRisk);
  const evidenceRefs = [...new Set(factors.flatMap((factor) => factor.evidenceRefs))];

  return {
    horizon,
    score,
    coverage,
    gate,
    confidence,
    factors,
    bullCase: opportunity.scenarios.find((scenario) => scenario.kind === "BULL")?.trigger ?? null,
    baseCase: opportunity.scenarios.find((scenario) => scenario.kind === "BASE")?.trigger ?? null,
    bearCase: opportunity.scenarios.find((scenario) => scenario.kind === "BEAR")?.trigger ?? null,
    risks: opportunity.riskFlags.map((flag) => flag.detail),
    invalidationConditions: [...new Set(opportunity.scenarios.map((scenario) => scenario.invalidation))],
    evidenceRefs,
    generatedAt: now.toISOString(),
  };
}
