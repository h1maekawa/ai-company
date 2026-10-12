import { THEME_UNIVERSE, sectorsForThemes } from "../intelligence/themes";
import type { Position } from "../types";
import type { PortfolioRiskAssessment, PortfolioRiskKey, PortfolioRiskLevel } from "./types";

export const round2 = (value: number) => Math.round(value * 100) / 100;

export function valuedPositions(positions: Position[]): Position[] {
  return positions.filter((position) => position.marketValueJpy !== null && position.marketValueJpy > 0);
}

/** Reuses the existing THEME_UNIVERSE ticker membership (app/lib/investing/intelligence/themes.ts). No second theme map. */
export function themesForTicker(ticker: string): string[] {
  const upper = ticker.toUpperCase();
  return THEME_UNIVERSE.filter((definition) => definition.tickers.includes(upper)).map((definition) => definition.name);
}

/** Reuses the existing sectorsForThemes (app/lib/investing/intelligence/themes.ts). */
export function sectorsForTicker(ticker: string): string[] {
  return sectorsForThemes(themesForTicker(ticker));
}

function levelFor(pct: number, thresholds: { mediumPct: number; highPct: number }): PortfolioRiskLevel {
  if (pct > thresholds.highPct) return "HIGH";
  if (pct > thresholds.mediumPct) return "MEDIUM";
  return "LOW";
}

/**
 * Shared "group holdings by a key, flag the largest share" computation used by Theme/Sector/
 * Single-Stock/Country/Currency Concentration. Coverage is the share of total valued-position
 * value whose key could be determined; unmapped value never gets treated as zero exposure.
 */
export function buildConcentrationAssessment(input: {
  key: PortfolioRiskKey;
  positions: Position[];
  keysFor: (position: Position) => string[];
  thresholds: { mediumPct: number; highPct: number };
  reasonLabel: string;
  emptyReason: string;
  noMappingReason: string;
}): PortfolioRiskAssessment {
  const { key, positions, keysFor, thresholds, reasonLabel, emptyReason, noMappingReason } = input;
  const valued = valuedPositions(positions);
  const total = valued.reduce((sum, position) => sum + (position.marketValueJpy ?? 0), 0);
  if (valued.length === 0 || total <= 0) {
    return { key, level: "DATA_INCOMPLETE", score: null, coverage: 0, reason: emptyReason, evidenceRefs: [], affectedTickers: [] };
  }

  const byKey = new Map<string, { value: number; tickers: Set<string> }>();
  let mappedValue = 0;
  for (const position of valued) {
    const keys = keysFor(position);
    if (keys.length > 0) mappedValue += position.marketValueJpy ?? 0;
    for (const groupKey of keys) {
      const entry = byKey.get(groupKey) ?? { value: 0, tickers: new Set<string>() };
      entry.value += position.marketValueJpy ?? 0;
      entry.tickers.add(position.code);
      byKey.set(groupKey, entry);
    }
  }

  const coverage = round2(mappedValue / total);
  if (byKey.size === 0) {
    return { key, level: "DATA_INCOMPLETE", score: null, coverage: 0, reason: noMappingReason, evidenceRefs: [], affectedTickers: [] };
  }

  const [topGroup, topEntry] = [...byKey.entries()].sort((a, b) => b[1].value - a[1].value)[0];
  const pct = round2((topEntry.value / total) * 100);
  return {
    key,
    level: levelFor(pct, thresholds),
    score: pct,
    coverage,
    reason: `${reasonLabel}「${topGroup}」が評価額の${pct}%`,
    evidenceRefs: [],
    affectedTickers: [...topEntry.tickers],
  };
}
