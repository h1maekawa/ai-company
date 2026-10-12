import type { EconomicNewsItem, FundamentalSnapshot, InvestmentCandidate, InvestmentOpportunity, InvestmentThemeGraph, MarketRegime } from "../types";
import { buildBottleneckAssessments } from "./bottleneck";
import { buildCandidateShortlist } from "./candidateDiscovery";
import { buildCausalLinks } from "./causalDistance";
import { buildCompanyComparisonRows } from "./companyComparison";
import { buildMarketHypothesis, marketHypothesisToArtifact } from "./marketHypothesis";
import { buildMarketStructure } from "./marketStructure";
import { buildPicksAndShovelsBeneficiaries } from "./picksAndShovels";
import type {
  BottleneckAssessment,
  CompanyComparisonArtifact,
  InvestmentResearchArtifact,
  InvestmentResearchBundle,
  MarketStructureArtifact,
} from "./types";

function structureToArtifact(structure: MarketStructureArtifact): InvestmentResearchArtifact {
  const unknowns = structure.nodes.filter((node) => node.evidenceRefs.length === 0).map((node) => ({ statement: `${node.label}のMarket Structure上の位置づけにEvidenceが未確認です` }));
  return {
    id: `research_structure_${structure.market.toLowerCase().replace(/\s+/g, "-")}_${structure.generatedAt.slice(0, 10)}`,
    subjectType: "THEME",
    subject: structure.market,
    facts: structure.nodes.map((node) => ({ statement: `${node.label} (${node.role}) depends on: ${node.dependencies.join(", ") || "none recorded"}`, evidenceIds: node.evidenceRefs })),
    interpretations: [],
    hypotheses: [],
    unknowns,
    evidenceRefs: [...new Set(structure.nodes.flatMap((node) => node.evidenceRefs))],
    confidence: structure.nodes.length ? structure.nodes.filter((node) => node.evidenceRefs.length > 0).length / structure.nodes.length : null,
    generatedAt: structure.generatedAt,
  };
}

function bottleneckToArtifact(assessment: BottleneckAssessment, now: Date): InvestmentResearchArtifact {
  return {
    id: `research_bottleneck_${assessment.bottleneck.toLowerCase().replace(/[^a-z0-9]+/g, "-")}_${now.toISOString().slice(0, 10)}`,
    subjectType: "BOTTLENECK",
    subject: assessment.bottleneck,
    facts: [assessment.supplyConstraint].filter((value): value is string => Boolean(value)).map((statement) => ({ statement, evidenceIds: assessment.evidenceRefs })),
    interpretations: [{ statement: `Demand driver: ${assessment.demandDriver}`, evidenceIds: assessment.evidenceRefs }],
    hypotheses: [],
    unknowns: [
      assessment.expansionLeadTime === null ? { statement: "Expansion lead time is not evidenced" } : null,
      assessment.supplierConcentration === null ? { statement: "Supplier concentration is not evidenced" } : null,
    ].filter((value): value is { statement: string } => value !== null),
    evidenceRefs: assessment.evidenceRefs,
    confidence: assessment.confidence,
    generatedAt: now.toISOString(),
  };
}

function comparisonToArtifact(comparison: CompanyComparisonArtifact): InvestmentResearchArtifact {
  const evidenceRefs = [...new Set(comparison.rows.flatMap((row) => row.evidenceRefs))];
  return {
    id: `research_comparison_${comparison.theme.toLowerCase().replace(/\s+/g, "-")}_${comparison.generatedAt.slice(0, 10)}`,
    subjectType: "COMPARISON",
    subject: comparison.theme,
    facts: comparison.rows.map((row) => ({ statement: `${row.ticker}: ${row.missingData.length} metrics missing`, evidenceIds: row.evidenceRefs })),
    interpretations: [],
    hypotheses: [],
    unknowns: comparison.singleCompanyException ? [{ statement: `${comparison.theme}は3社以上の比較候補がまだ揃っていません` }] : [],
    evidenceRefs,
    confidence: comparison.rows.length ? 1 - comparison.rows.reduce((sum, row) => sum + row.missingData.length, 0) / (comparison.rows.length * 10) : null,
    generatedAt: comparison.generatedAt,
  };
}

/**
 * Composes the Investment Thinking Model research sequence (Market Hypothesis -> Market
 * Structure -> Picks & Shovels -> Bottleneck -> Causal Distance -> Candidate Companies ->
 * Company Comparison) from already-computed Investment Intelligence inputs. This is an additive
 * extension alongside `runDailyInvestmentResearch` (app/lib/investing/intelligence/research.ts),
 * not a replacement: it takes the same candidates/opportunities/news/graph that the existing
 * Ticker -> Score pipeline already produced and structures them further. Pure function — no
 * network I/O, no persistence — so a failure here can be caught by the caller without affecting
 * the existing daily research artifact.
 */
export function buildInvestmentResearchBundle(input: {
  now: Date;
  marketRegime: MarketRegime;
  themes: string[];
  candidates: InvestmentCandidate[];
  opportunities: InvestmentOpportunity[];
  fundamentals: Map<string, FundamentalSnapshot>;
  news: EconomicNewsItem[];
  graph: InvestmentThemeGraph;
}): InvestmentResearchBundle {
  const { now, marketRegime, themes, candidates, opportunities, fundamentals, news, graph } = input;

  const marketHypotheses = themes.map((theme) => buildMarketHypothesis(theme, news, now));
  const marketStructure = themes.map((theme) => buildMarketStructure(theme, graph, now)).filter((item): item is MarketStructureArtifact => item !== null);
  const picksAndShovels = buildPicksAndShovelsBeneficiaries(candidates, graph);
  const bottlenecks = buildBottleneckAssessments(news, themes, now);
  const causalLinks = buildCausalLinks(candidates, graph);

  const candidateShortlist = [...new Map(
    themes
      .flatMap((theme) => buildCandidateShortlist(candidates.filter((candidate) => candidate.themes.includes(theme)), causalLinks, opportunities))
      .map((entry) => [entry.ticker, entry] as const)
  ).values()];

  const companyComparisons = themes
    .map((theme) => buildCompanyComparisonRows(theme, candidateShortlist.filter((entry) => entry.themes.includes(theme)), fundamentals, opportunities, now))
    .filter((comparison) => comparison.rows.length > 0);

  const artifacts: InvestmentResearchArtifact[] = [
    ...marketHypotheses.map((hypothesis) => marketHypothesisToArtifact(hypothesis, now)),
    ...marketStructure.map(structureToArtifact),
    ...bottlenecks.map((assessment) => bottleneckToArtifact(assessment, now)),
    ...companyComparisons.map(comparisonToArtifact),
  ];

  return {
    generatedAt: now.toISOString(),
    marketRegime,
    marketHypotheses,
    marketStructure,
    picksAndShovels,
    bottlenecks,
    causalLinks,
    candidateShortlist,
    companyComparisons,
    artifacts,
  };
}
