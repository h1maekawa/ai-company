export type IntelligenceFreshness = "live" | "delayed" | "daily" | "stale" | "unknown";
export type OpportunityGate = "GO_CANDIDATE" | "WAIT" | "PASS" | "DATA_INCOMPLETE";
export type MarketRegime = "RISK_ON" | "NEUTRAL" | "RISK_OFF" | "DATA_INCOMPLETE";
export type MarketRegimeArtifact = { regime: MarketRegime; requiredInputs: string[]; availableInputs: string[]; coverage: number; evidenceRefs: string[] };
export type ProviderState = "OK" | "NOT_CONFIGURED" | "ERROR" | "SKIPPED";
export type ProviderStatus = { provider: "Yahoo" | "FRED" | "SerpAPI" | "SEC" | "LINE" | "Slack"; status: ProviderState; checkedAt: string; detail?: string };

export type MacroMetric = { id: string; label: string; value: number | null; unit: string | null; previousValue: number | null; direction: "up" | "down" | "flat" | "unknown"; observedAt: string | null; fetchedAt: string; source: string; sourceUrl?: string; freshness: IntelligenceFreshness };
export type MacroSnapshot = { available: boolean; metrics: MacroMetric[]; regime: "POSITIVE" | "NEUTRAL" | "NEGATIVE" | "DATA_INCOMPLETE"; coverage: number; evidenceRefs: string[] };
export type EconomicNewsItem = { id: string; title: string; source: string; url: string; publishedAt: string | null; fetchedAt: string; factSummary: string; interpretation: string | null; impact: "positive" | "negative" | "neutral" | "unknown"; relatedSectors: string[]; relatedThemes: string[]; relatedTickers: string[]; freshness: IntelligenceFreshness };
export type SectorSnapshot = { id: string; name: string; proxy: string; momentum1d: number | null; momentum5d: number | null; momentum20d: number | null; relativeStrength20d: number | null; relativeVolume: number | null; high20Proximity: number | null; score: number | null; freshness: IntelligenceFreshness; evidenceRefs: string[] };
export type FundamentalSnapshot = { ticker: string; revenue: number | null; revenueGrowth: number | null; eps: number | null; epsGrowth: number | null; operatingIncome: number | null; operatingMargin: number | null; operatingCashFlow: number | null; capex: number | null; fcf: number | null; equity: number | null; roic: number | null; per: number | null; pbr: number | null; sourceUrl: string | null; observedAt: string | null; filedAt: string | null; freshness: IntelligenceFreshness };

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
  coverage: number;
  mandatoryEvidence: string[];
  missingEvidence: string[];
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
  marketRegimeDetail: MarketRegimeArtifact;
  marketEvidence: InvestmentEvidence[];
  sectorStrength: Array<{ name: string; score: number | null; reason: string }>;
  themeStrength: Array<{ name: string; score: number | null; reason: string }>;
  opportunities: InvestmentOpportunity[];
  portfolioAlerts: Array<{ ticker: string; level: "info" | "warning" | "critical"; message: string }>;
  economicEvents: Array<{ name: string; scheduledAt: string | null; impact: string; sourceUrl: string | null }>;
  news: InvestmentEvidence[];
  macro: MacroSnapshot;
  economicNews: EconomicNewsItem[];
  sectors: SectorSnapshot[];
  providerStatus: ProviderStatus[];
  runId: string;
  notificationDeliveries?: Array<{ eventId: string; channel: string; status: string; error?: string }>;
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
