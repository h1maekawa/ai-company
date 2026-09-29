export type IntelligenceFreshness = "live" | "delayed" | "daily" | "stale" | "unknown";
export type OpportunityGate = "GO_CANDIDATE" | "WAIT" | "PASS" | "DATA_INCOMPLETE";
export type MarketRegime = "RISK_ON" | "NEUTRAL" | "RISK_OFF" | "UNKNOWN";

export type InvestmentEvidence = {
  id: string;
  sourceType: "market" | "news" | "portfolio" | "research";
  sourceName: string;
  sourceUrl: string | null;
  publishedAt: string | null;
  fetchedAt: string;
  fact: string;
  metric: string | null;
  value: number | string | null;
  freshness: IntelligenceFreshness;
};

export type ScoreFactor = {
  key: "futureDemand" | "volume" | "earningsGrowth" | "quality" | "sectorStrength" | "catalyst" | "valuation" | "macroFit" | "portfolioFit";
  label: string;
  weight: number;
  score: number | null;
  reason: string;
};

export type InvestmentScenario = {
  kind: "BULL" | "BASE" | "BEAR";
  trigger: string;
  evidenceIds: string[];
  whatToWatch: string;
  invalidation: string;
  portfolioImpact: string;
};

export type InvestmentOpportunity = {
  id: string;
  ticker: string;
  name: string;
  theme: string;
  gate: OpportunityGate;
  score: number | null;
  scoreCoverage: number;
  breakdown: ScoreFactor[];
  relativeVolume: number | null;
  priceChangePct: number | null;
  catalyst: string | null;
  whyNow: string;
  portfolioImpact: string;
  portfolioAction: "WATCH" | "REDUCE_RISK" | "RECHECK_THESIS" | "NO_ACTION";
  scenarios: InvestmentScenario[];
  evidence: InvestmentEvidence[];
  missingData: string[];
  generatedAt: string;
};

export type IntelligenceToday = {
  asOf: string;
  marketRegime: MarketRegime;
  marketEvidence: InvestmentEvidence[];
  sectorStrength: Array<{ name: string; score: number | null; reason: string }>;
  themeStrength: Array<{ name: string; score: number | null; reason: string }>;
  opportunities: InvestmentOpportunity[];
  portfolioAlerts: Array<{ ticker: string; level: "info" | "warning" | "critical"; message: string }>;
  economicEvents: Array<{ name: string; scheduledAt: string | null; impact: string; sourceUrl: string | null }>;
  news: InvestmentEvidence[];
  summary: string;
};

export type InvestmentDecisionRecord = {
  id: string;
  opportunityId: string;
  decision: "GO" | "WAIT" | "PASS";
  reason: string;
  priceAtDecision: number | null;
  marketRegime: MarketRegime;
  opportunityScore: number | null;
  scenario: "BULL" | "BASE" | "BEAR";
  timestamp: string;
};
