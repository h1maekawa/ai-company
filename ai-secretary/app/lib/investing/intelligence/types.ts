export type IntelligenceFreshness = "live" | "delayed" | "daily" | "stale" | "unknown";
export type OpportunityGate = "GO_CANDIDATE" | "WAIT" | "PASS" | "DATA_INCOMPLETE";
export type MarketRegime = "RISK_ON" | "NEUTRAL" | "RISK_OFF" | "DATA_INCOMPLETE";
export type MarketRegimeArtifact = { regime: MarketRegime; requiredInputs: string[]; availableInputs: string[]; coverage: number; evidenceRefs: string[] };
export type ProviderState = "OK" | "NOT_CONFIGURED" | "ERROR" | "SKIPPED";
export type ProviderStatus = { provider: "Yahoo" | "FRED" | "SerpAPI" | "SEC" | "LINE" | "Slack"; status: ProviderState; checkedAt: string; detail?: string };
export type NewsImpact = { targetType: "market" | "sector" | "theme" | "ticker"; targetId: string; direction: "positive" | "negative" | "neutral" | "unknown"; confidence: number; rationale: string; evidenceIds: string[]; role: "future_demand" | "catalyst" };
export type NewsTrustTier = "TIER_1" | "TIER_2" | "TIER_3";

export type MacroMetric = { id: string; label: string; value: number | null; unit: string | null; previousValue: number | null; direction: "up" | "down" | "flat" | "unknown"; observedAt: string | null; fetchedAt: string; source: string; sourceUrl?: string; freshness: IntelligenceFreshness };
export type MacroSnapshot = { available: boolean; metrics: MacroMetric[]; regime: "POSITIVE" | "NEUTRAL" | "NEGATIVE" | "DATA_INCOMPLETE"; coverage: number; evidenceRefs: string[] };
export type EconomicNewsItem = { id: string; title: string; source: string; url: string; publishedAt: string | null; fetchedAt: string; factSummary: string; interpretation: string | null; impact: "positive" | "negative" | "neutral" | "unknown"; impacts: NewsImpact[]; trustTier: NewsTrustTier; relatedSectors: string[]; relatedThemes: string[]; relatedTickers: string[]; freshness: IntelligenceFreshness };
export type ThemeGraphDiscovery = { ticker: string; seedTheme: string; discoveredTheme: string; hopDistance: 0 | 1 | 2 };
export type InvestmentCandidate = { ticker: string; name: string; held: boolean; watchlisted: boolean; themes: string[]; sectors: string[]; aliases: string[]; candidateSources: Array<"portfolio" | "watchlist" | "theme-universe" | "theme-graph" | "research">; themeGraphDiscoveries?: ThemeGraphDiscovery[] };
export type ThemeStrength = { name: string; score: number | null; coverage: number; reason: string; evidenceRefs: string[]; freshness: IntelligenceFreshness; hot: boolean };
export type InvestmentThemeGraph = { nodes: Array<{ id: string; label: string; type: "theme" | "sector" | "ticker"; score: number | null; evidenceRefs: string[] }>; edges: Array<{ from: string; to: string; relation: "upstream" | "downstream" | "belongs-to" | "represented-by"; evidenceRefs: string[] }> };
export type OpportunityRiskFlag = { code: "LOW_LIQUIDITY" | "FUNDAMENTAL_STALE" | "SINGLE_SOURCE" | "MACRO_CONFLICT" | "NEGATIVE_DEMAND" | "NEGATIVE_CATALYST"; severity: "warning" | "critical"; detail: string };
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
  /** Market quote currency, retained from the provider instead of inferred downstream. */
  currency?: "USD" | "JPY" | "UNKNOWN";
  /** Explicit scope for classifying an evidence-backed cause. */
  scope?: "MARKET" | "INDUSTRY" | "COMPANY";
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
  riskFlags: OpportunityRiskFlag[];
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

  /**
   * PR-C: SHORT/MID/LONG horizon assessments and their combined Triple Gate, additive and
   * optional. The existing `score`/`gate` above remain the backward-compatible primary signal;
   * these never replace them.
   */
  shortTerm?: import("./horizon/types").HorizonAssessment;
  midTerm?: import("./horizon/types").HorizonAssessment;
  longTerm?: import("./horizon/types").HorizonAssessment;
  tripleGate?: import("./horizon/types").TripleGate;
};

export type IntelligenceToday = {
  /**
   * PR-B: structured research (Market Hypothesis -> Market Structure -> Picks & Shovels ->
   * Bottleneck -> Causal Distance -> Company Comparison), additive and optional. Absent on
   * older saved snapshots and when building fails; never required by existing consumers of
   * IntelligenceToday.
   */
  research?: import("./research/types").InvestmentResearchBundle;
  asOf: string;
  marketRegime: MarketRegime;
  marketRegimeDetail: MarketRegimeArtifact;
  marketEvidence: InvestmentEvidence[];
  sectorStrength: Array<{ name: string; score: number | null; reason: string }>;
  themeStrength: ThemeStrength[];
  themeGraph?: InvestmentThemeGraph;
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

  /**
   * PR-E: Decision Snapshot, additive and optional. `opportunityId` alone cannot be resolved
   * back to a ticker once a later day's IntelligenceToday has overwritten `opportunities` with a
   * different day's candidates, so `ticker`/`theme` are captured here directly. The three
   * Horizon snapshots and Triple Gate are copied verbatim from the opportunity already computed
   * that same run — never recomputed later — so Performance Review can never silently use a
   * score the decision-maker did not actually see. Records created before PR-E simply lack
   * these fields; Decision Performance treats that as DATA_INCOMPLETE, not a guess.
   */
  ticker?: string;
  theme?: string;
  shortTermSnapshot?: import("./horizon/types").HorizonAssessment;
  midTermSnapshot?: import("./horizon/types").HorizonAssessment;
  longTermSnapshot?: import("./horizon/types").HorizonAssessment;
  tripleGateSnapshot?: import("./horizon/types").TripleGate;
};
