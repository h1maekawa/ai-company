import { THEME_UNIVERSE } from "../themes";
import type { InvestmentCandidate, InvestmentThemeGraph } from "../types";
import type { CausalLink } from "./types";

const HOP_TO_DISTANCE = { 0: 1, 1: 2, 2: 3 } as const;

/**
 * Derives the causal distance (1 Direct .. 5 Indirect, per INVESTMENT_THINKING_MODEL.md) from a
 * demand theme to a candidate ticker, reusing the existing theme-graph discovery hop distance
 * (0/1/2) and the existing THEME_UNIVERSE ticker membership. Never assumes "Direct" just because
 * a candidate carries a matching theme tag with no graph/membership evidence — that case returns
 * `distance: null` (UNKNOWN).
 */
export function buildCausalLinks(candidates: InvestmentCandidate[], graph?: InvestmentThemeGraph): CausalLink[] {
  const links: CausalLink[] = [];
  for (const candidate of candidates) {
    const discoveries = candidate.themeGraphDiscoveries ?? [];
    if (discoveries.length > 0) {
      const closest = [...discoveries].sort((a, b) => a.hopDistance - b.hopDistance)[0];
      const evidenceRefs = graph?.edges.filter((edge) => edge.to === `theme:${closest.discoveredTheme}` || edge.from === `theme:${closest.discoveredTheme}`).flatMap((edge) => edge.evidenceRefs) ?? [];
      links.push({
        from: closest.seedTheme,
        to: candidate.ticker,
        distance: HOP_TO_DISTANCE[closest.hopDistance],
        explanation: `theme graphで${closest.seedTheme}から${closest.hopDistance}hopで到達（${closest.discoveredTheme}経由）`,
        evidenceRefs: [...new Set(evidenceRefs)],
        confidence: closest.hopDistance === 0 ? 0.8 : closest.hopDistance === 1 ? 0.6 : 0.4,
      });
      continue;
    }

    const directTheme = candidate.themes.find((theme) => THEME_UNIVERSE.find((definition) => definition.name === theme)?.tickers.includes(candidate.ticker));
    if (directTheme) {
      const graphNode = graph?.nodes.find((node) => node.id === `ticker:${candidate.ticker}`);
      links.push({
        from: directTheme,
        to: candidate.ticker,
        distance: 1,
        explanation: `${candidate.ticker}は既存theme universeで${directTheme}の直接構成銘柄です`,
        evidenceRefs: graphNode?.evidenceRefs ?? [],
        confidence: 0.8,
      });
      continue;
    }

    links.push({
      from: candidate.themes[0] ?? "UNKNOWN",
      to: candidate.ticker,
      distance: null,
      explanation: `${candidate.ticker}へのevidenced causal pathがtheme universe/theme graphにありません`,
      evidenceRefs: [],
      confidence: null,
    });
  }
  return links;
}
