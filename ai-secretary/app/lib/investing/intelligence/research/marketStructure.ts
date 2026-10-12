import { THEME_UNIVERSE } from "../themes";
import type { InvestmentThemeGraph } from "../types";
import type { MarketStructureArtifact, MarketStructureNode, MarketStructureRole } from "./types";

/**
 * Declarative value-chain role for each existing THEME_UNIVERSE entry (app/lib/investing/intelligence/themes.ts).
 * This is policy data, not a computed signal: it says where a theme sits in
 * Raw Materials -> Components -> Manufacturing -> Equipment -> Software -> Infrastructure ->
 * Distribution -> Customer, reusing the existing theme/ticker universe rather than introducing a
 * second theme store. Every THEME_UNIVERSE id must have an entry here (enforced by test).
 */
export const THEME_MARKET_ROLE: Record<string, MarketStructureRole> = {
  "semiconductor-equipment": "EQUIPMENT",
  memory: "COMPONENT",
  hbm: "COMPONENT",
  gpu: "MANUFACTURING",
  networking: "INFRASTRUCTURE",
  "data-center": "INFRASTRUCTURE",
  cooling: "INFRASTRUCTURE",
  power: "RAW_MATERIAL",
  nuclear: "RAW_MATERIAL",
  cybersecurity: "SOFTWARE",
  cloud: "DISTRIBUTION",
  ai: "CUSTOMER",
};

export function marketStructureRoleOf(themeId: string): MarketStructureRole | null {
  return THEME_MARKET_ROLE[themeId] ?? null;
}

/**
 * Builds the value-chain structure for a market/theme by reading the existing THEME_UNIVERSE
 * definition and, where available, the already-built InvestmentThemeGraph for evidenceRefs. It
 * never adds an edge or company that the existing theme universe/graph does not already carry.
 */
export function buildMarketStructure(market: string, graph: InvestmentThemeGraph, now = new Date()): MarketStructureArtifact | null {
  const definition = THEME_UNIVERSE.find((item) => item.name === market);
  if (!definition) return null;

  const nodeFor = (id: string): MarketStructureNode | null => {
    const theme = THEME_UNIVERSE.find((item) => item.id === id);
    if (!theme) return null;
    const role = THEME_MARKET_ROLE[theme.id];
    const graphNode = graph.nodes.find((item) => item.id === `theme:${theme.name}`);
    return {
      id: theme.id,
      label: theme.name,
      role,
      companies: theme.tickers,
      dependencies: theme.upstreamThemes,
      evidenceRefs: graphNode?.evidenceRefs ?? [],
    };
  };

  const visitedIds = new Set<string>([definition.id]);
  const queue = [...definition.upstreamThemes, ...definition.downstreamThemes];
  const relatedIds: string[] = [];
  for (const relatedName of queue) {
    const related = THEME_UNIVERSE.find((item) => item.name === relatedName);
    if (related && !visitedIds.has(related.id)) {
      visitedIds.add(related.id);
      relatedIds.push(related.id);
    }
  }

  const nodes = [definition.id, ...relatedIds].map(nodeFor).filter((node): node is MarketStructureNode => node !== null);

  return { market, nodes, graph, generatedAt: now.toISOString() };
}
