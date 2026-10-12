import { THEME_UNIVERSE } from "../themes";
import type { InvestmentCandidate, InvestmentThemeGraph } from "../types";
import { marketStructureRoleOf } from "./marketStructure";
import type { PicksAndShovelsBeneficiary } from "./types";

/**
 * Identifies infrastructure/enabler ("picks and shovels") beneficiaries of a demand theme.
 *
 * Per INVESTMENT_THINKING_MODEL.md: "Infrastructure beneficiaries require an evidenced
 * dependency, not thematic similarity alone." A candidate only qualifies if it arrived via a
 * one-hop theme-graph discovery (InvestmentCandidate.themeGraphDiscoveries with hopDistance 1),
 * i.e. an existing upstream/downstream edge in THEME_UNIVERSE, not because it merely shares a
 * theme tag with the seed demand.
 */
export function buildPicksAndShovelsBeneficiaries(candidates: InvestmentCandidate[], graph: InvestmentThemeGraph): PicksAndShovelsBeneficiary[] {
  const beneficiaries: PicksAndShovelsBeneficiary[] = [];
  for (const candidate of candidates) {
    for (const discovery of candidate.themeGraphDiscoveries ?? []) {
      if (discovery.hopDistance !== 1) continue;
      const discoveredTheme = THEME_UNIVERSE.find((item) => item.name === discovery.discoveredTheme);
      const edge = graph.edges.find((item) => (item.from === `theme:${discovery.seedTheme}` && item.to === `theme:${discovery.discoveredTheme}`) || (item.from === `theme:${discovery.discoveredTheme}` && item.to === `theme:${discovery.seedTheme}`));
      beneficiaries.push({
        ticker: discovery.ticker,
        growthDriver: discovery.seedTheme,
        requiredResource: discovery.discoveredTheme,
        role: discoveredTheme ? marketStructureRoleOf(discoveredTheme.id) : null,
        evidenceRefs: edge?.evidenceRefs ?? [],
      });
    }
  }
  return beneficiaries;
}
