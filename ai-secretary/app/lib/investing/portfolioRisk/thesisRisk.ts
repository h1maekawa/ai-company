import type { Position } from "../types";
import type { InvestmentOpportunity } from "../intelligence/types";
import type { InvestmentResearchBundle } from "../intelligence/research/types";
import { round2, valuedPositions } from "./shared";
import { PORTFOLIO_RISK_THRESHOLDS } from "./thresholds";
import type { PortfolioRiskAssessment } from "./types";

const THESIS_RISK_FLAG_CODES = new Set(["NEGATIVE_DEMAND", "FUNDAMENTAL_STALE", "MACRO_CONFLICT", "NEGATIVE_CATALYST"]);

function levelFor(sharePct: number): "LOW" | "MEDIUM" | "HIGH" {
  const cfg = PORTFOLIO_RISK_THRESHOLDS.thesisRisk;
  if (sharePct > cfg.highSharePct) return "HIGH";
  if (sharePct > cfg.mediumSharePct) return "MEDIUM";
  return "LOW";
}

/**
 * Finds existing evidence-backed signals that a held position's investment thesis may be
 * weakening. Reuses, without inventing a new signal type:
 * - the existing OpportunityRiskFlag codes NEGATIVE_DEMAND / FUNDAMENTAL_STALE / MACRO_CONFLICT /
 *   NEGATIVE_CATALYST (app/lib/investing/intelligence/engine.ts),
 * - the existing LONG HorizonAssessment gate (PR-C) — PASS on a held position's LONG horizon,
 * - the existing MarketHypothesis (PR-B) — contrary evidence outweighing supporting evidence for
 *   the position's theme ("research invalidation").
 * This never triggers a sale; it only surfaces the signal for human review.
 */
export function buildThesisRisk(positions: Position[], opportunities: InvestmentOpportunity[], research: InvestmentResearchBundle | undefined): PortfolioRiskAssessment {
  const valued = valuedPositions(positions);
  if (valued.length === 0) {
    return { key: "thesisRisk", level: "DATA_INCOMPLETE", score: null, coverage: 0, reason: "評価額のある保有がありません", evidenceRefs: [], affectedTickers: [] };
  }

  const byTicker = new Map(opportunities.map((opportunity) => [opportunity.ticker, opportunity]));
  const matched = valued.filter((position) => byTicker.has(position.code));
  if (matched.length === 0) {
    return { key: "thesisRisk", level: "DATA_INCOMPLETE", score: null, coverage: 0, reason: "本日のResearch対象に該当する保有がありません", evidenceRefs: [], affectedTickers: [] };
  }

  const flaggedTickers = new Set<string>();
  const evidenceRefs = new Set<string>();
  for (const position of matched) {
    const opportunity = byTicker.get(position.code)!;
    const criticalFlags = opportunity.riskFlags.filter((flag) => THESIS_RISK_FLAG_CODES.has(flag.code));
    const longWeak = opportunity.longTerm?.gate === "PASS";
    const hypothesis = research?.marketHypotheses.find((item) => item.market === opportunity.theme);
    const researchInvalidated = Boolean(hypothesis && hypothesis.contraryEvidenceRefs.length > hypothesis.supportingEvidenceRefs.length);

    if (criticalFlags.length > 0 || longWeak || researchInvalidated) {
      flaggedTickers.add(position.code);
      for (const flag of criticalFlags) evidenceRefs.add(flag.code);
      if (longWeak) for (const ref of opportunity.longTerm?.evidenceRefs ?? []) evidenceRefs.add(ref);
      if (researchInvalidated) for (const ref of hypothesis?.contraryEvidenceRefs ?? []) evidenceRefs.add(ref);
    }
  }

  const sharePct = round2((flaggedTickers.size / matched.length) * 100);
  return {
    key: "thesisRisk",
    level: levelFor(sharePct),
    score: sharePct,
    coverage: round2(matched.length / valued.length),
    reason: flaggedTickers.size === 0 ? "評価済み保有にThesis Risk信号はありません" : `評価済み保有の${sharePct}%でThesis Risk信号を検出`,
    evidenceRefs: [...evidenceRefs],
    affectedTickers: [...flaggedTickers],
  };
}
