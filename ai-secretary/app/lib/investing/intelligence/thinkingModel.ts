export type InvestmentThinkingModelStatus = "DRAFT" | "ACTIVE" | "DEPRECATED";

export type InvestmentThinkingModel = {
  id: string;
  version: string;
  owner: "investment";
  status: InvestmentThinkingModelStatus;
  principles: string[];
  researchSequence: string[];
  hypothesisRules: string[];
  marketDemandRules: string[];
  causalDistanceRules: string[];
  picksAndShovelsRules: string[];
  bottleneckRules: string[];
  companyResearchRules: string[];
  fundamentalRules: string[];
  valuationRules: string[];
  riskRules: string[];
  outputRules: string[];
  humanOnlyRules: string[];
  createdAt: string;
  updatedAt: string;
  approvedBy: string | null;
};

/**
 * Canonical Investment Thinking Model. This is a versioned, reviewed policy artifact,
 * not a second research store. Runtime research results remain in IntelligenceToday.
 */
export const ACTIVE_INVESTMENT_THINKING_MODEL: Readonly<InvestmentThinkingModel> = Object.freeze({
  id: "investment-thinking-model",
  version: "1.0.0",
  owner: "investment",
  status: "ACTIVE",
  principles: [
    "Separate Fact, Interpretation, Hypothesis, and Unknown.",
    "Prefer durable demand, causal proximity, and evidenced bottlenecks over narratives.",
    "Never turn missing or stale evidence into a current fact.",
  ],
  researchSequence: ["market-hypothesis", "market-demand", "market-structure", "bottleneck", "company-comparison", "fundamental", "valuation", "risk", "current-view"],
  hypothesisRules: ["Every hypothesis must state confirming and invalidating evidence."],
  marketDemandRules: ["Demand must cite observable evidence; unsupported demand remains UNKNOWN."],
  causalDistanceRules: ["Classify beneficiaries by distance from demand: DIRECT, ENABLER, SECOND_ORDER, UNKNOWN."],
  picksAndShovelsRules: ["Infrastructure beneficiaries require an evidenced dependency, not thematic similarity alone."],
  bottleneckRules: ["A bottleneck requires explicit constraint evidence; absence of supply data is not a bottleneck."],
  companyResearchRules: ["Compare three to five companies when the evidenced candidate universe allows it."],
  fundamentalRules: ["Every metric carries source, period, observedAt, freshness, and confidence; missing is null."],
  valuationRules: ["Valuation is INSUFFICIENT without measured current and comparison evidence."],
  riskRules: ["Unknown probability stays UNKNOWN and is never converted into a numeric estimate."],
  outputRules: ["Output Why this market, Market Structure, Bottleneck, Companies, Fundamental, Valuation, Risk, Current View, and Unknown."],
  humanOnlyRules: ["Buy/Sell, final GO/WAIT/PASS, position size, order placement, broker actions, and money transfer are HUMAN_ONLY."],
  createdAt: "2026-10-12T00:00:00.000Z",
  updatedAt: "2026-10-12T00:00:00.000Z",
  approvedBy: "maekawa",
});

export function investmentThinkingModelRef() {
  return { id: ACTIVE_INVESTMENT_THINKING_MODEL.id, version: ACTIVE_INVESTMENT_THINKING_MODEL.version } as const;
}
