import { ACTIVE_INVESTMENT_THINKING_MODEL, investmentThinkingModelRef } from "./thinkingModel";
import type { EconomicNewsItem, FundamentalSnapshot, IntelligenceFreshness, InvestmentCandidate, InvestmentEvidence, InvestmentOpportunity, InvestmentThemeGraph, MarketRegime } from "./types";

export type ClaimKind = "FACT" | "INTERPRETATION" | "HYPOTHESIS" | "UNKNOWN";
export type ResearchClaim = { id: string; kind: ClaimKind; statement: string; evidenceIds: string[] };
export type CausalDistance = "DIRECT" | "ENABLER" | "SECOND_ORDER" | "UNKNOWN";
export type MeasuredField = { value: number | null; period: string | null; sourceUrl: string | null; observedAt: string | null; freshness: IntelligenceFreshness; confidence: "HIGH" | "MEDIUM" | "LOW" | "UNKNOWN" };
export type CompanyResearchComparison = {
  ticker: string; name: string; causalDistance: CausalDistance; whyIncluded: string; evidenceIds: string[];
  fundamentals: Record<"revenue" | "revenueGrowth" | "eps" | "epsGrowth" | "operatingMargin" | "fcf" | "roic" | "per" | "pbr", MeasuredField>;
  valuation: { status: "LOW" | "FAIR" | "HIGH" | "INSUFFICIENT"; reason: string; evidenceIds: string[] };
  risks: Array<{ category: "DEMAND" | "COMPETITION" | "EXECUTION" | "VALUATION" | "MACRO" | "DATA"; description: string; probability: "LOW" | "MEDIUM" | "HIGH" | "UNKNOWN"; evidenceIds: string[] }>;
};
export type InvestmentResearchArtifact = {
  id: string; generatedAt: string; model: { id: string; version: string };
  whyThisMarket: { hypothesis: string; confirmingEvidenceIds: string[]; invalidatingEvidence: string[]; status: "SUPPORTED" | "PARTIAL" | "UNKNOWN" };
  marketDemand: { status: "SUPPORTED" | "PARTIAL" | "UNKNOWN"; observations: string[]; evidenceIds: string[] };
  marketStructure: { graph: InvestmentThemeGraph; causalPaths: Array<{ ticker: string; distance: CausalDistance; path: string[]; evidenceIds: string[] }> };
  bottlenecks: Array<{ name: string; reason: string; evidenceIds: string[]; status: "EVIDENCED" }>;
  companies: CompanyResearchComparison[];
  currentView: { regime: MarketRegime; summary: string; humanDecisionRequired: true };
  claims: ResearchClaim[];
  unknowns: string[];
};

const metric = (value: number | null, snapshot: FundamentalSnapshot): MeasuredField => ({ value, period: snapshot.filedAt, sourceUrl: snapshot.sourceUrl, observedAt: snapshot.observedAt, freshness: snapshot.freshness, confidence: value === null ? "UNKNOWN" : snapshot.freshness === "stale" || snapshot.freshness === "unknown" ? "LOW" : "MEDIUM" });
const distance = (candidate: InvestmentCandidate): CausalDistance => candidate.themeGraphDiscoveries?.some((item) => item.hopDistance === 0) ? "DIRECT" : candidate.themeGraphDiscoveries?.some((item) => item.hopDistance === 1) ? "ENABLER" : candidate.themeGraphDiscoveries?.some((item) => item.hopDistance === 2) ? "SECOND_ORDER" : candidate.themes.length ? "DIRECT" : "UNKNOWN";
const median = (values: number[]) => { const sorted = [...values].sort((a, b) => a - b); const middle = Math.floor(sorted.length / 2); return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2; };

export function buildInvestmentResearchArtifact(input: { now: Date; regime: MarketRegime; candidates: InvestmentCandidate[]; opportunities: InvestmentOpportunity[]; fundamentals: Map<string, FundamentalSnapshot>; graph: InvestmentThemeGraph; news: EconomicNewsItem[]; marketEvidence: InvestmentEvidence[] }): InvestmentResearchArtifact {
  const ranked = input.opportunities.filter((item) => item.evidence.length > 0).slice(0, 5);
  const selected = ranked.length >= 3 ? ranked : input.opportunities.slice(0, 5);
  const comparablePer = selected.map((item) => input.fundamentals.get(item.ticker)).filter((item): item is FundamentalSnapshot => Boolean(item && item.per !== null && !["stale", "unknown"].includes(item.freshness))).map((item) => item.per as number);
  const perMedian = comparablePer.length >= 3 ? median(comparablePer) : null;
  const evidenceIds = [...new Set([...input.marketEvidence.map((item) => item.id), ...input.news.flatMap((item) => item.impacts.flatMap((impact) => impact.evidenceIds))])];
  const demandNews = input.news.filter((item) => item.impacts.some((impact) => impact.role === "future_demand" && impact.direction !== "unknown"));
  const companies = selected.map<CompanyResearchComparison>((opportunity) => {
    const candidate = input.candidates.find((item) => item.ticker === opportunity.ticker);
    const fundamental = input.fundamentals.get(opportunity.ticker) ?? { ticker: opportunity.ticker, revenue: null, revenueGrowth: null, eps: null, epsGrowth: null, operatingIncome: null, operatingMargin: null, operatingCashFlow: null, capex: null, fcf: null, equity: null, roic: null, per: null, pbr: null, sourceUrl: null, observedAt: null, filedAt: null, freshness: "unknown" as const };
    const fundamentalEvidence = opportunity.evidence.filter((item) => item.metric === "fundamentals").map((item) => item.id);
    const valuation = fundamental.per !== null && perMedian !== null ? { status: fundamental.per < perMedian * 0.8 ? "LOW" as const : fundamental.per > perMedian * 1.2 ? "HIGH" as const : "FAIR" as const, reason: `Current PER ${fundamental.per} compared with evidence-backed candidate median ${perMedian}. This is a relative observation, not a trade signal.`, evidenceIds: fundamentalEvidence } : { status: "INSUFFICIENT" as const, reason: "At least three fresh measured PER values are required for relative comparison.", evidenceIds: fundamentalEvidence };
    return {
      ticker: opportunity.ticker, name: opportunity.name, causalDistance: candidate ? distance(candidate) : "UNKNOWN", whyIncluded: opportunity.whyNow, evidenceIds: opportunity.evidence.map((item) => item.id),
      fundamentals: { revenue: metric(fundamental.revenue, fundamental), revenueGrowth: metric(fundamental.revenueGrowth, fundamental), eps: metric(fundamental.eps, fundamental), epsGrowth: metric(fundamental.epsGrowth, fundamental), operatingMargin: metric(fundamental.operatingMargin, fundamental), fcf: metric(fundamental.fcf, fundamental), roic: metric(fundamental.roic, fundamental), per: metric(fundamental.per, fundamental), pbr: metric(fundamental.pbr, fundamental) },
      valuation,
      risks: opportunity.riskFlags.map((risk) => ({ category: risk.code === "MACRO_CONFLICT" ? "MACRO" : risk.code === "FUNDAMENTAL_STALE" || risk.code === "SINGLE_SOURCE" ? "DATA" : risk.code === "NEGATIVE_DEMAND" ? "DEMAND" : "EXECUTION", description: risk.detail, probability: "UNKNOWN", evidenceIds: opportunity.evidence.map((item) => item.id) })),
    };
  });
  const explicitConstraints = input.news.flatMap((item) => item.impacts.filter((impact) => /constraint|shortage|capacity|供給制約|不足|ボトルネック/iu.test(`${item.factSummary} ${impact.rationale}`) && impact.evidenceIds.length).map((impact) => ({ name: impact.targetId, reason: impact.rationale, evidenceIds: impact.evidenceIds, status: "EVIDENCED" as const })));
  const unknowns = [companies.length < 3 ? "Fewer than three evidence-backed company candidates are available." : null, demandNews.length === 0 ? "No explicit current market-demand evidence is available." : null, explicitConstraints.length === 0 ? "No explicit bottleneck evidence is available." : null, ...companies.filter((item) => item.valuation.status === "INSUFFICIENT").map((item) => `${item.ticker}: valuation comparison evidence is insufficient.`)].filter((item): item is string => Boolean(item));
  const hypothesis = demandNews.length ? `${demandNews[0].relatedThemes[0] ?? "Observed market"} demand may affect the evidenced value chain.` : "A current market-demand hypothesis cannot be established from available evidence.";
  return {
    id: `investment-research-${input.now.toISOString().slice(0, 10)}`, generatedAt: input.now.toISOString(), model: investmentThinkingModelRef(),
    whyThisMarket: { hypothesis, confirmingEvidenceIds: evidenceIds, invalidatingEvidence: ["Demand evidence weakens or becomes stale", "The identified dependency is not confirmed"], status: demandNews.length > 1 ? "SUPPORTED" : demandNews.length ? "PARTIAL" : "UNKNOWN" },
    marketDemand: { status: demandNews.length > 1 ? "SUPPORTED" : demandNews.length ? "PARTIAL" : "UNKNOWN", observations: demandNews.map((item) => item.factSummary), evidenceIds },
    marketStructure: { graph: input.graph, causalPaths: companies.map((item) => ({ ticker: item.ticker, distance: item.causalDistance, path: [item.causalDistance, item.ticker], evidenceIds: item.evidenceIds })) },
    bottlenecks: explicitConstraints, companies,
    currentView: { regime: input.regime, summary: input.regime === "DATA_INCOMPLETE" ? "Current view is unavailable because required market evidence is incomplete." : `Current measured regime is ${input.regime}; this is research context, not a trade decision.`, humanDecisionRequired: true },
    claims: [
      ...input.marketEvidence.map((item) => ({ id: `fact:${item.id}`, kind: "FACT" as const, statement: item.fact, evidenceIds: [item.id] })),
      { id: "interpretation:market", kind: "INTERPRETATION", statement: input.regime === "DATA_INCOMPLETE" ? "Market interpretation is withheld." : `Available inputs are consistent with ${input.regime}.`, evidenceIds },
      { id: "hypothesis:demand", kind: "HYPOTHESIS", statement: hypothesis, evidenceIds },
      ...unknowns.map((statement, index) => ({ id: `unknown:${index}`, kind: "UNKNOWN" as const, statement, evidenceIds: [] })),
    ], unknowns,
  };
}

export function validateResearchArtifact(artifact: InvestmentResearchArtifact): string[] {
  const errors: string[] = [];
  if (artifact.model.id !== ACTIVE_INVESTMENT_THINKING_MODEL.id) errors.push("MODEL_ID_MISMATCH");
  if (!artifact.currentView.humanDecisionRequired) errors.push("HUMAN_ONLY_REQUIRED");
  if (artifact.bottlenecks.some((item) => !item.evidenceIds.length)) errors.push("BOTTLENECK_WITHOUT_EVIDENCE");
  return errors;
}
