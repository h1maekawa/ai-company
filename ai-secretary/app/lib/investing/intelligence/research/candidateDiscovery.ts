import type { InvestmentCandidate, InvestmentOpportunity } from "../types";
import type { CandidateCompanyShortlistEntry, CausalLink } from "./types";

/**
 * Shortlists 3-5 companies to compare for a theme, reusing the existing InvestmentCandidate list
 * (app/lib/investing/intelligence/themes.ts) and the causal distance already derived for each
 * candidate. Ranks by causal proximity first (closer = more directly exposed to the thesis),
 * then by the existing opportunity score. A candidate is never added without a recorded
 * `candidateSources` entry (see INVESTMENT_THINKING_MODEL.md).
 */
export function buildCandidateShortlist(
  candidates: InvestmentCandidate[],
  causalLinks: CausalLink[],
  opportunities: InvestmentOpportunity[],
  options: { min?: number; max?: number } = {}
): CandidateCompanyShortlistEntry[] {
  const min = options.min ?? 3;
  const max = options.max ?? 5;
  const distanceOf = (ticker: string) => causalLinks.find((link) => link.to === ticker)?.distance ?? null;
  const scoreOf = (ticker: string) => opportunities.find((item) => item.ticker === ticker)?.score ?? null;

  const ranked = [...candidates]
    .filter((candidate) => candidate.candidateSources.length > 0)
    .sort((a, b) => {
      const distanceA = distanceOf(a.ticker);
      const distanceB = distanceOf(b.ticker);
      if (distanceA !== distanceB) {
        if (distanceA === null) return 1;
        if (distanceB === null) return -1;
        return distanceA - distanceB;
      }
      const scoreA = scoreOf(a.ticker);
      const scoreB = scoreOf(b.ticker);
      if (scoreA !== scoreB) {
        if (scoreA === null) return 1;
        if (scoreB === null) return -1;
        return scoreB - scoreA;
      }
      return a.ticker.localeCompare(b.ticker);
    });

  const selected = ranked.slice(0, Math.max(min, Math.min(max, ranked.length)));
  return selected.map((candidate) => ({
    ticker: candidate.ticker,
    name: candidate.name,
    candidateSources: candidate.candidateSources,
    themes: candidate.themes,
    causalDistance: distanceOf(candidate.ticker),
  }));
}
