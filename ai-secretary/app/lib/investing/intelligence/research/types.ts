/**
 * Investment Research Structure (PR-B).
 *
 * These types formalize the Investment Thinking Model v1 research sequence
 * (docs/INVESTMENT_THINKING_MODEL.md: Market Hypothesis -> Long-Term Demand -> Market Structure ->
 * Picks & Shovels -> Bottleneck -> Causal Distance -> Candidate Companies -> Company Comparison)
 * on top of the existing Investment Intelligence types in `../types.ts`. They do not replace
 * `InvestmentOpportunity`/`InvestmentEvidence`/`InvestmentThemeGraph`; they compose with them.
 *
 * No new persistence is introduced here. These are pure data shapes produced from already-loaded
 * `IntelligenceToday` inputs (news, macro, theme graph, fundamentals) and attached to
 * `IntelligenceToday.research` as an additive, optional field.
 */

import type {
  FundamentalSnapshot,
  InvestmentCandidate,
  InvestmentEvidence,
  InvestmentOpportunity,
  InvestmentThemeGraph,
  MarketRegime,
  ThemeGraphDiscovery,
} from "../types";

export type ClaimKind = "FACT" | "INTERPRETATION" | "HYPOTHESIS" | "UNKNOWN";

/** A single classified research statement. Every research step emits these, never a bare string. */
export type ResearchClaim = {
  id: string;
  kind: ClaimKind;
  statement: string;
  evidenceIds: string[];
};

export type ResearchFact = { statement: string; evidenceIds: string[] };
export type ResearchInterpretation = { statement: string; evidenceIds: string[] };
export type ResearchHypothesis = {
  statement: string;
  confirmingEvidenceIds: string[];
  contraryEvidenceIds: string[];
};
/** An Unknown never carries evidenceIds: it exists precisely because there is none. */
export type ResearchUnknown = { statement: string };

/**
 * Canonical research envelope (one per research subject). Every specific artifact below
 * (MarketHypothesis, MarketStructure, BottleneckAssessment, CausalLink, CompanyComparisonRow) can
 * be expressed as one of these for a unified, subject-agnostic research log.
 */
export type InvestmentResearchArtifact = {
  id: string;
  subjectType: "MARKET" | "THEME" | "BOTTLENECK" | "COMPANY" | "COMPARISON";
  subject: string;
  facts: ResearchFact[];
  interpretations: ResearchInterpretation[];
  hypotheses: ResearchHypothesis[];
  unknowns: ResearchUnknown[];
  evidenceRefs: string[];
  confidence: number | null;
  generatedAt: string;
};

// ─── Market Hypothesis ────────────────────────────────────────────────────

export type MarketHypothesis = {
  market: string;
  thesis: string;
  whyNow: string[];
  adoptionSignals: string[];
  supportingEvidenceRefs: string[];
  contraryEvidenceRefs: string[];
  unknowns: string[];
  confidence: number | null;
};

// ─── Market Structure (Value Chain) ───────────────────────────────────────

export type MarketStructureRole =
  | "RAW_MATERIAL"
  | "COMPONENT"
  | "MANUFACTURING"
  | "EQUIPMENT"
  | "SOFTWARE"
  | "INFRASTRUCTURE"
  | "DISTRIBUTION"
  | "CUSTOMER";

export type MarketStructureNode = {
  id: string;
  label: string;
  role: MarketStructureRole;
  companies: string[];
  dependencies: string[];
  evidenceRefs: string[];
};

export type MarketStructureArtifact = {
  market: string;
  nodes: MarketStructureNode[];
  /** The existing InvestmentThemeGraph this structure was derived from (not duplicated). */
  graph: InvestmentThemeGraph;
  generatedAt: string;
};

// ─── Picks & Shovels ───────────────────────────────────────────────────────

export type PicksAndShovelsBeneficiary = {
  ticker: string;
  growthDriver: string;
  requiredResource: string;
  role: MarketStructureRole | null;
  evidenceRefs: string[];
};

// ─── Bottleneck ────────────────────────────────────────────────────────────

export type BottleneckAssessment = {
  bottleneck: string;
  demandDriver: string;
  supplyConstraint: string | null;
  capacityConstraint: string | null;
  expansionLeadTime: string | null;
  supplierConcentration: string | null;
  barrierToEntry: string | null;
  substitutes: string[];
  beneficiaryTickers: string[];
  evidenceRefs: string[];
  confidence: number | null;
};

// ─── Causal Distance ───────────────────────────────────────────────────────

/**
 * 1 Direct / 2 Strong / 3 Moderate / 4 Weak / 5 Indirect, per INVESTMENT_THINKING_MODEL.md.
 * `null` means UNKNOWN: no evidenced path exists. A distance is never guessed to fill this gap.
 */
export type CausalDistanceValue = 1 | 2 | 3 | 4 | 5 | null;

export type CausalLink = {
  from: string;
  to: string;
  distance: CausalDistanceValue;
  explanation: string;
  evidenceRefs: string[];
  confidence: number | null;
};

// ─── Candidate Company Discovery ──────────────────────────────────────────

export type CandidateCompanyShortlistEntry = {
  ticker: string;
  name: string;
  candidateSources: InvestmentCandidate["candidateSources"];
  themes: string[];
  causalDistance: CausalDistanceValue;
};

// ─── Company Comparison ───────────────────────────────────────────────────

export const RISK_CATEGORIES = [
  "Demand Slowdown",
  "Competition",
  "Technology Replacement",
  "Customer Concentration",
  "Geopolitical",
  "Regulation",
  "China Exposure",
  "Supply Chain",
  "Overinvestment",
  "Valuation",
  "Cyclicality",
  "Interest Rate",
  "FX",
  "Market Expectation",
  "OTHER",
] as const;
export type RiskCategory = (typeof RISK_CATEGORIES)[number];

export type CompanyComparisonRow = {
  ticker: string;
  name: string;

  marketRole: MarketStructureRole | null;
  themeExposure: string[];

  causalDistance: CausalDistanceValue;

  revenueGrowth: number | null;
  epsGrowth: number | null;

  grossMargin: number | null;
  operatingMargin: number | null;

  fcf: number | null;
  roic: number | null;

  per: number | null;
  forwardPer: number | null;
  pbr: number | null;

  moat: string | null;

  criticalRisks: string[];
  warningRisks: string[];

  evidenceRefs: string[];
  missingData: string[];
};

export type CompanyComparisonArtifact = {
  theme: string;
  rows: CompanyComparisonRow[];
  /** Per INVESTMENT_THINKING_MODEL.md: 3-5 companies by default; fewer only when evidence is thin. */
  singleCompanyException: boolean;
  generatedAt: string;
};

// ─── Top-level bundle attached to IntelligenceToday.research ─────────────

export type InvestmentResearchBundle = {
  generatedAt: string;
  marketRegime: MarketRegime;
  marketHypotheses: MarketHypothesis[];
  marketStructure: MarketStructureArtifact[];
  picksAndShovels: PicksAndShovelsBeneficiary[];
  bottlenecks: BottleneckAssessment[];
  causalLinks: CausalLink[];
  candidateShortlist: CandidateCompanyShortlistEntry[];
  companyComparisons: CompanyComparisonArtifact[];
  artifacts: InvestmentResearchArtifact[];
};

export type { ThemeGraphDiscovery, InvestmentOpportunity, InvestmentEvidence, FundamentalSnapshot };
