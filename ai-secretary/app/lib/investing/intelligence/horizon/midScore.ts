import type { DailyBar } from "../../../fund/marketData/calc";
import type { InvestmentOpportunity } from "../types";
import { buildAssessment, buildFactor, clamp, relativeStrength20d, rescaleExistingFactor } from "./shared";
import type { HorizonAssessment } from "./types";

/** Single source of truth for MID's weights (sum to 100). See SHORT_SCORE_WEIGHTS for why this is exported. */
export const MID_SCORE_WEIGHTS: Record<string, number> = {
  futureDemand: 20,
  earningsGrowth: 15,
  revisionGuidance: 15,
  sectorStrength: 10,
  catalyst: 10,
  relativeStrength: 10,
  valuation: 10,
  quality: 5,
  macroFit: 5,
};

/**
 * MID (1-6 months) per INVESTMENT_THINKING_MODEL.md §Mid Score. Reuses the existing Future
 * Demand/Earnings Growth/Sector Strength/Catalyst/Valuation/Quality/Macro Fit factors already
 * computed on InvestmentOpportunity.breakdown. "Revision / Guidance" is always null: no existing
 * provider carries earnings-revision or guidance data, and this PR does not invent one.
 */
export function buildMidTermAssessment(opportunity: InvestmentOpportunity, bars: DailyBar[] | null, spyBars: DailyBar[] | null, now = new Date()): HorizonAssessment {
  const relativeStrength = relativeStrength20d(bars, spyBars);
  const w = MID_SCORE_WEIGHTS;

  const factors = [
    buildFactor("futureDemand", "Future Demand", w.futureDemand, rescaleExistingFactor(opportunity.breakdown, "futureDemand")),
    buildFactor("earningsGrowth", "Earnings Growth", w.earningsGrowth, rescaleExistingFactor(opportunity.breakdown, "earningsGrowth")),
    buildFactor("revisionGuidance", "Revision / Guidance", w.revisionGuidance, null),
    buildFactor("sectorStrength", "Sector Strength", w.sectorStrength, rescaleExistingFactor(opportunity.breakdown, "sectorStrength")),
    buildFactor("catalyst", "Catalyst", w.catalyst, rescaleExistingFactor(opportunity.breakdown, "catalyst")),
    buildFactor("relativeStrength", "Relative Strength", w.relativeStrength, relativeStrength === null ? null : { score: clamp(0, 100, 50 + relativeStrength * 2), reason: `20日モメンタムがSPYと比べ${relativeStrength >= 0 ? "+" : ""}${relativeStrength.toFixed(1)}pt` }),
    buildFactor("valuation", "Valuation", w.valuation, rescaleExistingFactor(opportunity.breakdown, "valuation")),
    buildFactor("quality", "Quality", w.quality, rescaleExistingFactor(opportunity.breakdown, "quality")),
    buildFactor("macroFit", "Macro Fit", w.macroFit, rescaleExistingFactor(opportunity.breakdown, "macroFit")),
  ];

  return buildAssessment("MID", factors, opportunity, now);
}
