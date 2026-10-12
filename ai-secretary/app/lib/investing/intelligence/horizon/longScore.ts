import type { InvestmentOpportunity } from "../types";
import type { InvestmentResearchBundle } from "../research/types";
import { buildAssessment, buildFactor, clamp, rescaleExistingFactor } from "./shared";
import type { HorizonAssessment } from "./types";

/** 1 Direct .. 5 Indirect -> confidence multiplier, per INVESTMENT_THINKING_MODEL.md §Causal Distance. */
const CAUSAL_DISTANCE_CONFIDENCE: Record<1 | 2 | 3 | 4 | 5, number> = { 1: 1, 2: 0.85, 3: 0.7, 4: 0.55, 5: 0.4 };

/**
 * LONG (6 months - 3+ years) per INVESTMENT_THINKING_MODEL.md §Long Score.
 *
 * Required by PR-C to reuse PR-B's Research Structure rather than a second pipeline: Future
 * Demand/TAM comes from the existing `MarketHypothesis` for the opportunity's theme, Revenue/EPS
 * Growth and FCF/ROIC and Margin Quality come from the existing `CompanyComparisonRow`, and
 * Structural Bottleneck comes from the existing `BottleneckAssessment`. Where PR-B has no row for
 * this ticker/theme (e.g. it wasn't in a hot-theme shortlist that day), each factor falls back to
 * the equivalent existing `InvestmentOpportunity.breakdown` factor so coverage degrades
 * gracefully instead of going straight to zero. Competitive Advantage (`moat`), Balance Sheet,
 * and Valuation stay `null`: no existing provider computes them, and this PR does not invent one.
 */
export function buildLongTermAssessment(opportunity: InvestmentOpportunity, research: InvestmentResearchBundle | undefined, now = new Date()): HorizonAssessment {
  const hypothesis = research?.marketHypotheses.find((item) => item.market === opportunity.theme);
  const comparisonRow = research?.companyComparisons.flatMap((comparison) => comparison.rows).find((row) => row.ticker === opportunity.ticker);
  const bottleneck = research?.bottlenecks.find((item) => item.beneficiaryTickers.includes(opportunity.ticker));

  const futureDemand = hypothesis && hypothesis.confidence !== null
    ? { score: hypothesis.confidence * 100, reason: hypothesis.thesis, evidenceRefs: hypothesis.supportingEvidenceRefs }
    : rescaleExistingFactor(opportunity.breakdown, "futureDemand");

  const growth = comparisonRow?.revenueGrowth ?? comparisonRow?.epsGrowth ?? null;
  const revenueEpsGrowth = growth !== null
    ? { score: clamp(0, 100, 50 + growth * 2.5), reason: `Company Comparisonの成長率 ${growth.toFixed(1)}%`, evidenceRefs: comparisonRow?.evidenceRefs ?? [] }
    : rescaleExistingFactor(opportunity.breakdown, "earningsGrowth");

  const fcf = comparisonRow?.fcf ?? null;
  const fcfRoic = fcf !== null
    ? { score: fcf > 0 ? 100 : 20, reason: `Company ComparisonのFCF ${fcf.toLocaleString()}`, evidenceRefs: comparisonRow?.evidenceRefs ?? [] }
    : rescaleExistingFactor(opportunity.breakdown, "quality");

  const operatingMargin = comparisonRow?.operatingMargin ?? null;
  const marginQuality = operatingMargin === null ? null : { score: clamp(0, 100, operatingMargin * 2.5), reason: `Company Comparisonの営業利益率 ${operatingMargin.toFixed(1)}%`, evidenceRefs: comparisonRow?.evidenceRefs ?? [] };

  const structuralBottleneck = !bottleneck || bottleneck.confidence === null ? null : { score: bottleneck.confidence * 100, reason: bottleneck.bottleneck, evidenceRefs: bottleneck.evidenceRefs };

  const factors = [
    buildFactor("futureDemandTam", "Future Demand / TAM", 20, futureDemand),
    buildFactor("competitiveAdvantage", "Competitive Advantage", 15, null),
    buildFactor("revenueEpsGrowth", "Revenue / EPS Growth", 15, revenueEpsGrowth),
    buildFactor("fcfRoic", "FCF / ROIC", 15, fcfRoic),
    buildFactor("marginQuality", "Margin Quality", 10, marginQuality),
    buildFactor("balanceSheet", "Balance Sheet", 5, null),
    buildFactor("structuralBottleneck", "Structural Bottleneck", 10, structuralBottleneck),
    buildFactor("valuation", "Valuation", 10, null),
  ];

  const assessment = buildAssessment("LONG", factors, opportunity, now);
  const causalDistance = research?.causalLinks.find((link) => link.to === opportunity.ticker)?.distance ?? null;
  if (assessment.confidence === null || causalDistance === null) return assessment;
  return { ...assessment, confidence: Math.round(assessment.confidence * CAUSAL_DISTANCE_CONFIDENCE[causalDistance] * 100) / 100 };
}
