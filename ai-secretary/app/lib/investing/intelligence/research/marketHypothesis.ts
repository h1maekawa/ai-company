import type { EconomicNewsItem, NewsImpact } from "../types";
import type { InvestmentResearchArtifact, MarketHypothesis } from "./types";

const fresh = (item: EconomicNewsItem) => !["stale", "unknown"].includes(item.freshness);
const dedupe = (values: string[]) => [...new Set(values)];
/** Look-ahead guard: evidence published after the research timestamp is never used to form a hypothesis. */
const notFromTheFuture = (item: EconomicNewsItem, now: Date) => !item.publishedAt || new Date(item.publishedAt).getTime() <= now.getTime();

/**
 * Builds a Market Hypothesis for one theme/market from already-fetched, already-classified
 * news impacts (see app/lib/investing/intelligence/newsImpact.ts). Reuses the existing
 * EconomicNewsItem.impacts[] role classification; does not re-fetch or re-classify news.
 *
 * Per INVESTMENT_THINKING_MODEL.md: a hypothesis without supporting evidenceIds stays UNKNOWN,
 * never invented from theme familiarity. News published after `now` is excluded (no look-ahead).
 */
export function buildMarketHypothesis(market: string, news: EconomicNewsItem[], now = new Date()): MarketHypothesis {
  const relevant = news.filter((item) => fresh(item) && notFromTheFuture(item, now) && item.relatedThemes.includes(market));
  const impactsOf = (direction: NewsImpact["direction"], role?: NewsImpact["role"]) =>
    relevant.flatMap((item) => item.impacts.filter((impact) => impact.targetId === market && impact.direction === direction && (!role || impact.role === role)));

  const demandImpacts = impactsOf("positive", "future_demand");
  const catalystImpacts = impactsOf("positive", "catalyst");
  const contraryImpacts = [...impactsOf("negative", "future_demand"), ...impactsOf("negative", "catalyst")];

  const supportingEvidenceRefs = dedupe([...demandImpacts, ...catalystImpacts].flatMap((impact) => impact.evidenceIds));
  const contraryEvidenceRefs = dedupe(contraryImpacts.flatMap((impact) => impact.evidenceIds));

  const whyNow = dedupe(relevant.filter((item) => item.impacts.some((impact) => catalystImpacts.includes(impact))).map((item) => item.factSummary)).slice(0, 5);
  const adoptionSignals = dedupe(relevant.filter((item) => item.impacts.some((impact) => demandImpacts.includes(impact))).map((item) => item.factSummary)).slice(0, 5);

  const unknowns: string[] = [];
  if (supportingEvidenceRefs.length === 0) unknowns.push(`${market}の需要・カタリストを裏付けるEvidenceがまだありません`);
  else if (new Set([...demandImpacts, ...catalystImpacts].map((impact) => impact.evidenceIds[0])).size < 2) unknowns.push(`${market}の仮説は単一材料のみに基づいています（複数独立Evidenceが望ましい）`);

  const confidence = supportingEvidenceRefs.length === 0 ? null : Math.min(0.9, 0.3 + supportingEvidenceRefs.length * 0.15);

  return {
    market,
    thesis: supportingEvidenceRefs.length === 0
      ? `${market}について現時点でEvidenceに基づく市場仮説を立てられません`
      : `${market}は${demandImpacts.length}件の需要Evidenceと${catalystImpacts.length}件のCatalyst Evidenceにより、需要拡大の仮説を支持します`,
    whyNow,
    adoptionSignals,
    supportingEvidenceRefs,
    contraryEvidenceRefs,
    unknowns,
    confidence,
  };
}

export function marketHypothesisToArtifact(hypothesis: MarketHypothesis, now: Date): InvestmentResearchArtifact {
  return {
    id: `research_market_${hypothesis.market.toLowerCase().replace(/\s+/g, "-")}_${now.toISOString().slice(0, 10)}`,
    subjectType: "MARKET",
    subject: hypothesis.market,
    facts: hypothesis.adoptionSignals.map((statement) => ({ statement, evidenceIds: hypothesis.supportingEvidenceRefs })),
    interpretations: hypothesis.whyNow.map((statement) => ({ statement, evidenceIds: hypothesis.supportingEvidenceRefs })),
    hypotheses: [{ statement: hypothesis.thesis, confirmingEvidenceIds: hypothesis.supportingEvidenceRefs, contraryEvidenceIds: hypothesis.contraryEvidenceRefs }],
    unknowns: hypothesis.unknowns.map((statement) => ({ statement })),
    evidenceRefs: [...hypothesis.supportingEvidenceRefs, ...hypothesis.contraryEvidenceRefs],
    confidence: hypothesis.confidence,
    generatedAt: now.toISOString(),
  };
}
