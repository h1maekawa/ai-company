import { INVESTMENT_INTELLIGENCE_CONFIG } from "./config";
import { normalizeTheme, THEME_UNIVERSE } from "./themes";
import type { EconomicNewsItem, InvestmentOpportunity, InvestmentThemeGraph, SectorSnapshot, ThemeStrength } from "./types";

export type ThemeSignals = { news: EconomicNewsItem[]; sectors: SectorSnapshot[]; opportunities: InvestmentOpportunity[] };
const usable = (value: number | null | undefined) => typeof value === "number" && Number.isFinite(value);
export function scoreTheme(name: string, input: ThemeSignals): ThemeStrength {
  const normalized = normalizeTheme(name); const definition = THEME_UNIVERSE.find((item) => item.name === normalized);
  const news = input.news.filter((item) => item.relatedThemes.includes(normalized) && !["stale", "unknown"].includes(item.freshness));
  const impacts = news.flatMap((item) => item.impacts.filter((impact) => impact.targetId === normalized && impact.direction === "positive"));
  const sector = input.sectors.filter((item) => definition?.sectors.includes(item.name) && !["stale", "unknown"].includes(item.freshness) && usable(item.score));
  const opportunities = input.opportunities.filter((item) => normalizeTheme(item.theme) === normalized);
  const factors: Array<[number, number | null, string[]]> = [
    [20, news.length ? Math.min(20, news.length * 7) : null, news.map((item) => item.id)],
    [20, impacts.some((item) => item.role === "future_demand") ? 20 : null, impacts.filter((item) => item.role === "future_demand").flatMap((item) => item.evidenceIds)],
    [15, impacts.some((item) => item.role === "catalyst") ? 15 : null, impacts.filter((item) => item.role === "catalyst").flatMap((item) => item.evidenceIds)],
    [15, sector.length ? Math.round((sector.reduce((sum, item) => sum + (item.score ?? 0), 0) / sector.length) * .15) : null, sector.flatMap((item) => item.evidenceRefs)],
    [10, opportunities.some((item) => usable(item.priceChangePct)) ? Math.min(10, Math.max(0, 5 + Math.max(...opportunities.map((item) => item.priceChangePct ?? -Infinity)))) : null, opportunities.flatMap((item) => item.evidence.map((entry) => entry.id))],
    [10, opportunities.some((item) => usable(item.relativeVolume)) ? Math.min(10, Math.max(...opportunities.map((item) => (item.relativeVolume ?? 0) * 4))) : null, opportunities.flatMap((item) => item.evidence.filter((entry) => entry.metric === "ohlcv").map((entry) => entry.id))],
    [10, news.length ? Math.min(10, new Set(news.map((item) => item.source)).size * 4) : null, news.map((item) => item.id)],
  ];
  const available = factors.filter(([, score]) => score !== null); const coverageWeight = available.reduce((sum, [weight]) => sum + weight, 0);
  const coverage = coverageWeight / 100; const score = coverageWeight ? Math.round(available.reduce((sum, [, value]) => sum + (value ?? 0), 0) / coverageWeight * 100) : null;
  const refs = [...new Set(available.flatMap(([, , evidence]) => evidence))]; const freshness = news.length || sector.length ? "daily" : "unknown";
  return { name: normalized, score, coverage, evidenceRefs: refs, freshness, hot: score !== null && score >= INVESTMENT_INTELLIGENCE_CONFIG.minimumHotThemeScore && coverage >= INVESTMENT_INTELLIGENCE_CONFIG.minimumHotThemeCoverage, reason: score === null ? "DATA_INCOMPLETE" : `実データ${available.length}/7因子・${refs.length}件のEvidenceで評価` };
}
export function buildThemeGraph(seedThemes: string[], strengths: ThemeStrength[] = [], maxHops = 2): InvestmentThemeGraph {
  const nodes = new Map<string, InvestmentThemeGraph["nodes"][number]>(), edges = new Map<string, InvestmentThemeGraph["edges"][number]>();
  const queue = [...new Set(seedThemes.map(normalizeTheme))].map((name) => ({ name, depth: 0 })), visited = new Set<string>();
  while (queue.length) { const { name, depth } = queue.shift()!; if (visited.has(name) || depth > Math.min(2, maxHops)) continue; visited.add(name); const definition = THEME_UNIVERSE.find((item) => item.name === name); if (!definition) continue; const strength = strengths.find((item) => item.name === name);
    nodes.set(`theme:${name}`, { id: `theme:${name}`, label: name, type: "theme", score: strength?.score ?? null, evidenceRefs: strength?.evidenceRefs ?? [] });
    for (const sector of definition.sectors) { nodes.set(`sector:${sector}`, { id: `sector:${sector}`, label: sector, type: "sector", score: null, evidenceRefs: [] }); edges.set(`${name}:sector:${sector}`, { from: `theme:${name}`, to: `sector:${sector}`, relation: "belongs-to", evidenceRefs: [] }); }
    for (const ticker of definition.tickers) { nodes.set(`ticker:${ticker}`, { id: `ticker:${ticker}`, label: ticker, type: "ticker", score: null, evidenceRefs: [] }); edges.set(`${name}:ticker:${ticker}`, { from: `theme:${name}`, to: `ticker:${ticker}`, relation: "represented-by", evidenceRefs: strength?.evidenceRefs ?? [] }); }
    if (depth < Math.min(2, maxHops)) for (const [relation, related] of [["upstream", definition.upstreamThemes], ["downstream", definition.downstreamThemes]] as const) for (const target of related) { const normalized = normalizeTheme(target); if (!THEME_UNIVERSE.some((item) => item.name === normalized)) continue; edges.set(`${name}:${relation}:${normalized}`, { from: `theme:${name}`, to: `theme:${normalized}`, relation, evidenceRefs: strength?.evidenceRefs ?? [] }); queue.push({ name: normalized, depth: depth + 1 }); }
  } return { nodes: [...nodes.values()], edges: [...edges.values()] };
}
export function detectMeaningfulThemeChanges(current: ThemeStrength[], previous: ThemeStrength[]): string[] { const before = new Map(previous.map((item) => [item.name, item])); return current.flatMap((item) => { const old = before.get(item.name); if (item.hot && !old?.hot) return [`NEW:${item.name}`]; if (item.score !== null && old?.score !== null && old?.score !== undefined && Math.abs(item.score - old.score) >= 10) return [`DELTA:${item.name}:${item.score - old.score}`]; if (old && item.evidenceRefs.some((ref) => !old.evidenceRefs.includes(ref))) return [`EVIDENCE:${item.name}`]; return []; }); }
