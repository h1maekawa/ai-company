import type { DailyBar } from "../../../fund/marketData/calc";
import type { InvestmentOpportunity } from "../types";
import { buildAssessment, buildFactor, clamp, relativeStrength20d, rescaleExistingFactor } from "./shared";
import type { HorizonAssessment } from "./types";

/**
 * MID (1-6 months) per INVESTMENT_THINKING_MODEL.md §Mid Score. Reuses the existing Future
 * Demand/Earnings Growth/Sector Strength/Catalyst/Valuation/Quality/Macro Fit factors already
 * computed on InvestmentOpportunity.breakdown. "Revision / Guidance" is always null: no existing
 * provider carries earnings-revision or guidance data, and this PR does not invent one.
 */
export function buildMidTermAssessment(opportunity: InvestmentOpportunity, bars: DailyBar[] | null, spyBars: DailyBar[] | null, now = new Date()): HorizonAssessment {
  const relativeStrength = relativeStrength20d(bars, spyBars);

  const factors = [
    buildFactor("futureDemand", "Future Demand", 20, rescaleExistingFactor(opportunity.breakdown, "futureDemand")),
    buildFactor("earningsGrowth", "Earnings Growth", 15, rescaleExistingFactor(opportunity.breakdown, "earningsGrowth")),
    buildFactor("revisionGuidance", "Revision / Guidance", 15, null),
    buildFactor("sectorStrength", "Sector Strength", 10, rescaleExistingFactor(opportunity.breakdown, "sectorStrength")),
    buildFactor("catalyst", "Catalyst", 10, rescaleExistingFactor(opportunity.breakdown, "catalyst")),
    buildFactor("relativeStrength", "Relative Strength", 10, relativeStrength === null ? null : { score: clamp(0, 100, 50 + relativeStrength * 2), reason: `20日モメンタムがSPYと比べ${relativeStrength >= 0 ? "+" : ""}${relativeStrength.toFixed(1)}pt` }),
    buildFactor("valuation", "Valuation", 10, rescaleExistingFactor(opportunity.breakdown, "valuation")),
    buildFactor("quality", "Quality", 5, rescaleExistingFactor(opportunity.breakdown, "quality")),
    buildFactor("macroFit", "Macro Fit", 5, rescaleExistingFactor(opportunity.breakdown, "macroFit")),
  ];

  return buildAssessment("MID", factors, opportunity, now);
}
