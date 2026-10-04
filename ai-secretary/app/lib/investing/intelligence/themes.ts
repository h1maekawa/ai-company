import { INVESTMENT_INTELLIGENCE_CONFIG } from "./config";
import type { InvestmentCandidate, ThemeGraphDiscovery, ThemeStrength } from "./types";

export type ThemeDefinition = { id: string; name: string; aliases: string[]; sectors: string[]; tickers: string[]; etfs: string[]; upstreamThemes: string[]; downstreamThemes: string[] };
export const THEME_UNIVERSE: ThemeDefinition[] = [
  { id: "ai", name: "AI", aliases: ["artificial intelligence", "生成ai"], sectors: ["Technology"], tickers: ["NVDA", "MSFT", "GOOGL"], etfs: [], upstreamThemes: ["GPU", "Networking"], downstreamThemes: ["AI Agents", "Cloud"] },
  { id: "gpu", name: "GPU", aliases: ["ai compute"], sectors: ["Semiconductors"], tickers: ["NVDA", "AMD"], etfs: ["SOXX"], upstreamThemes: ["Semiconductor Equipment", "HBM"], downstreamThemes: ["AI", "Data Center"] },
  { id: "hbm", name: "HBM", aliases: ["high bandwidth memory"], sectors: ["Semiconductors"], tickers: ["MU"], etfs: ["SOXX"], upstreamThemes: ["Memory", "Semiconductor Equipment"], downstreamThemes: ["GPU"] },
  { id: "memory", name: "Memory", aliases: ["dram", "nand"], sectors: ["Semiconductors"], tickers: ["MU"], etfs: ["SOXX"], upstreamThemes: ["Semiconductor Equipment"], downstreamThemes: ["HBM"] },
  { id: "semiconductor-equipment", name: "Semiconductor Equipment", aliases: ["半導体製造装置"], sectors: ["Semiconductors", "Industrials"], tickers: ["AMAT", "LRCX", "KLAC"], etfs: ["SOXX"], upstreamThemes: [], downstreamThemes: ["GPU", "Memory"] },
  { id: "networking", name: "Networking", aliases: ["network", "optical networking"], sectors: ["Technology", "Communication"], tickers: ["ANET", "AVGO"], etfs: [], upstreamThemes: ["Optical"], downstreamThemes: ["Data Center", "AI Infrastructure"] },
  { id: "data-center", name: "Data Center", aliases: ["datacenter", "data centre", "ai infrastructure"], sectors: ["Technology", "Industrials"], tickers: ["VRT", "EQIX"], etfs: [], upstreamThemes: ["Power", "Cooling", "Networking"], downstreamThemes: ["Cloud", "AI"] },
  { id: "power", name: "Power", aliases: ["electricity", "grid"], sectors: ["Utilities", "Industrials"], tickers: ["CEG", "ETN"], etfs: [], upstreamThemes: ["Nuclear"], downstreamThemes: ["Data Center"] },
  { id: "cooling", name: "Cooling", aliases: ["data center cooling", "thermal management"], sectors: ["Industrials"], tickers: ["VRT", "TT"], etfs: [], upstreamThemes: [], downstreamThemes: ["Data Center"] },
  { id: "nuclear", name: "Nuclear", aliases: ["原子力", "uranium"], sectors: ["Utilities", "Energy"], tickers: ["CEG", "CCJ"], etfs: [], upstreamThemes: [], downstreamThemes: ["Power"] },
  { id: "cybersecurity", name: "Cybersecurity", aliases: ["cyber security"], sectors: ["Technology"], tickers: ["CRWD", "PANW"], etfs: [], upstreamThemes: [], downstreamThemes: ["Cloud"] },
  { id: "cloud", name: "Cloud", aliases: ["cloud computing"], sectors: ["Technology"], tickers: ["MSFT", "AMZN", "GOOGL"], etfs: [], upstreamThemes: ["Data Center"], downstreamThemes: ["AI Agents"] },
];
const clean = (value: string) => value.normalize("NFKC").replace(/[^\p{L}\p{N}\s-]/gu, " ").replace(/\s+/g, " ").trim().toLowerCase();
export function normalizeTheme(value: string): string { const normalized = clean(value); const definition = THEME_UNIVERSE.find((theme) => [theme.name, ...theme.aliases].some((alias) => clean(alias) === normalized)); if (definition) return definition.name; if (["ai半導体", "ai semiconductor", "semiconductor ai"].includes(normalized)) return "AI Semiconductor"; return value.normalize("NFKC").replace(/[^\p{L}\p{N}\s-]/gu, " ").replace(/\s+/g, " ").trim(); }
export function sectorsForThemes(themes: string[]): string[] { const result = new Set<string>(); for (const value of themes) { const normalized = normalizeTheme(value); for (const definition of THEME_UNIVERSE) if (definition.name === normalized || definition.aliases.map(normalizeTheme).includes(normalized)) definition.sectors.forEach((sector) => result.add(sector)); if (normalized === "AI Semiconductor") result.add("Semiconductors"); } return [...result]; }
export function buildInvestmentCandidates(input: { portfolio: Array<{ ticker: string; name: string }>; watchlist: Array<{ ticker: string; name: string; theme: string }>; discoveryThemes?: string[]; max?: number }): InvestmentCandidate[] {
  const candidates = new Map<string, InvestmentCandidate>();
  const get = (ticker: string, name: string) => { const key = ticker.trim().toUpperCase(); const current = candidates.get(key) ?? { ticker: key, name, held: false, watchlisted: false, themes: [], sectors: [], aliases: [], candidateSources: [] }; candidates.set(key, current); return current; };
  for (const item of input.portfolio) { const candidate = get(item.ticker, item.name); candidate.held = true; if (!candidate.candidateSources.includes("portfolio")) candidate.candidateSources.push("portfolio"); }
  for (const item of input.watchlist) { const candidate = get(item.ticker, item.name); candidate.watchlisted = true; const theme = normalizeTheme(item.theme); if (theme && !candidate.themes.includes(theme)) candidate.themes.push(theme); if (!candidate.candidateSources.includes("watchlist")) candidate.candidateSources.push("watchlist"); }
  for (const requested of input.discoveryThemes ?? []) { const definition = THEME_UNIVERSE.find((theme) => theme.name === normalizeTheme(requested)); if (!definition) continue; for (const ticker of definition.tickers) { const candidate = get(ticker, ticker); if (!candidate.themes.includes(definition.name)) candidate.themes.push(definition.name); if (!candidate.candidateSources.includes("theme-universe")) candidate.candidateSources.push("theme-universe"); } }
  for (const candidate of candidates.values()) for (const definition of THEME_UNIVERSE) if (definition.tickers.includes(candidate.ticker)) { if (!candidate.themes.includes(definition.name)) candidate.themes.push(definition.name); if (!candidate.candidateSources.includes("theme-universe")) candidate.candidateSources.push("theme-universe"); }
  for (const candidate of candidates.values()) candidate.sectors = sectorsForThemes(candidate.themes);
  return [...candidates.values()].slice(0, input.max ?? 30);
}

const validTicker = (ticker: string) => /^[A-Z][A-Z0-9.-]{0,9}$/.test(ticker);

export function discoverThemeGraphCandidates(input: {
  strengths: ThemeStrength[];
  existingCandidates: InvestmentCandidate[];
  max?: number;
}): InvestmentCandidate[] {
  const existing = new Map(input.existingCandidates.map((item) => [item.ticker, item]));
  const hotSeeds = input.strengths
    .filter((item) => item.hot && item.score !== null && item.score >= INVESTMENT_INTELLIGENCE_CONFIG.minimumHotThemeScore && item.coverage >= INVESTMENT_INTELLIGENCE_CONFIG.minimumHotThemeCoverage && !["stale", "unknown"].includes(item.freshness))
    .sort((a, b) => (b.score ?? -1) - (a.score ?? -1) || b.coverage - a.coverage || a.name.localeCompare(b.name));
  const discoveries: Array<ThemeGraphDiscovery & { seedScore: number; seedCoverage: number }> = [];
  for (const seed of hotSeeds) {
    const queue: Array<{ theme: string; distance: 0 | 1 | 2 }> = [{ theme: normalizeTheme(seed.name), distance: 0 }];
    const visited = new Set<string>();
    while (queue.length) {
      const current = queue.shift()!;
      if (visited.has(current.theme)) continue;
      visited.add(current.theme);
      const definition = THEME_UNIVERSE.find((item) => item.name === current.theme);
      if (!definition) continue;
      for (const ticker of definition.tickers.map((value) => value.trim().toUpperCase()).filter(validTicker)) {
        discoveries.push({ ticker, seedTheme: seed.name, discoveredTheme: definition.name, hopDistance: current.distance, seedScore: seed.score ?? 0, seedCoverage: seed.coverage });
      }
      if (current.distance < 2) {
        const nextDistance = (current.distance + 1) as 1 | 2;
        for (const related of [...definition.upstreamThemes, ...definition.downstreamThemes].map(normalizeTheme).sort()) queue.push({ theme: related, distance: nextDistance });
      }
    }
  }
  discoveries.sort((a, b) => b.seedScore - a.seedScore || b.seedCoverage - a.seedCoverage || a.hopDistance - b.hopDistance || a.ticker.localeCompare(b.ticker) || a.discoveredTheme.localeCompare(b.discoveredTheme));
  const selected = new Map<string, InvestmentCandidate>();
  const limit = input.max ?? INVESTMENT_INTELLIGENCE_CONFIG.maxThemeGraphCandidates;
  for (const discovery of discoveries) {
    const existingCandidate = existing.get(discovery.ticker);
    if (existingCandidate) {
      if (!existingCandidate.candidateSources.includes("theme-graph")) existingCandidate.candidateSources.push("theme-graph");
      if (!existingCandidate.themes.includes(discovery.discoveredTheme)) existingCandidate.themes.push(discovery.discoveredTheme);
      existingCandidate.themeGraphDiscoveries ??= [];
      if (!existingCandidate.themeGraphDiscoveries.some((item) => item.seedTheme === discovery.seedTheme && item.discoveredTheme === discovery.discoveredTheme && item.hopDistance === discovery.hopDistance)) existingCandidate.themeGraphDiscoveries.push({ ticker: discovery.ticker, seedTheme: discovery.seedTheme, discoveredTheme: discovery.discoveredTheme, hopDistance: discovery.hopDistance });
      existingCandidate.sectors = sectorsForThemes(existingCandidate.themes);
      continue;
    }
    let candidate = selected.get(discovery.ticker);
    if (!candidate) {
      if (selected.size >= limit) continue;
      candidate = { ticker: discovery.ticker, name: discovery.ticker, held: false, watchlisted: false, themes: [], sectors: [], aliases: [], candidateSources: ["theme-graph"], themeGraphDiscoveries: [] };
      selected.set(discovery.ticker, candidate);
    }
    if (!candidate.themes.includes(discovery.discoveredTheme)) candidate.themes.push(discovery.discoveredTheme);
    candidate.themeGraphDiscoveries!.push({ ticker: discovery.ticker, seedTheme: discovery.seedTheme, discoveredTheme: discovery.discoveredTheme, hopDistance: discovery.hopDistance });
  }
  for (const candidate of selected.values()) candidate.sectors = sectorsForThemes(candidate.themes);
  return [...selected.values()];
}
