import { createWebSearchProvider } from "@/app/lib/company/research/webProvider";
import { normalizeTheme, sectorsForThemes, THEME_UNIVERSE } from "../themes";
import { classifyNewsImpacts, newsTrustTier } from "../newsImpact";
import type { EconomicNewsItem, IntelligenceFreshness } from "../types";

const QUERIES = ["Federal Reserve interest rates inflation employment GDP", "AI CAPEX semiconductor data center power earnings"];

export function normalizeEconomicNews(input: { title: string; summary: string; sourceUrl?: string; sourceName?: string; publishedAt?: string }, fetchedAt: string): EconomicNewsItem | null {
  if (!input.title || !input.sourceUrl || !/^https?:\/\//.test(input.sourceUrl)) return null;
  const text = `${input.title} ${input.summary}`.toLowerCase();
  const mentions = (word: string) => { const escaped = word.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); return new RegExp(`(^|[^a-z0-9])${escaped}([^a-z0-9]|$)`, "i").test(text); };
  const themes = THEME_UNIVERSE.filter((theme) => [theme.name, ...theme.aliases].some(mentions)).map((theme) => normalizeTheme(theme.name));
  const fetchedAtMs = new Date(fetchedAt).getTime();
  const freshness: IntelligenceFreshness = input.publishedAt && fetchedAtMs - new Date(input.publishedAt).getTime() <= 72 * 3_600_000 ? "daily" : input.publishedAt ? "stale" : "unknown";
  const id = `news_${Buffer.from(input.sourceUrl).toString("base64url").slice(0, 32)}`;
  const trustTier = newsTrustTier(input.sourceUrl);
  const impacts = classifyNewsImpacts({ id, title: input.title, summary: input.summary, themes, trustTier });
  const directions = [...new Set(impacts.map((impact) => impact.direction))];
  const impact = directions.length === 1 ? directions[0] : "unknown";
  return { id, title: input.title.slice(0, 240), source: input.sourceName ?? new URL(input.sourceUrl).hostname, url: input.sourceUrl, publishedAt: input.publishedAt ?? null, fetchedAt, factSummary: input.summary.slice(0, 600), interpretation: null, impact, impacts, trustTier, relatedSectors: sectorsForThemes(themes), relatedThemes: themes, relatedTickers: [], freshness };
}

export async function fetchEconomicNews(): Promise<{ items: EconomicNewsItem[]; status: "OK" | "NOT_CONFIGURED" | "ERROR" }> {
  if (process.env.SERPAPI_ENABLED !== "true" || !process.env.SERPAPI_KEY) return { items: [], status: "NOT_CONFIGURED" };
  try {
    const provider = createWebSearchProvider(); const fetchedAt = new Date().toISOString();
    const results = await Promise.all(QUERIES.map((topic) => provider.search({ departmentId: "fund", researcherAgentId: "fund-research", topic, maxItems: 5, freshness: "week" })));
    const seen = new Set<string>();
    const items = results.flatMap((result) => result.items).flatMap((item) => { const normalized = normalizeEconomicNews(item, fetchedAt); if (!normalized || seen.has(normalized.url)) return []; seen.add(normalized.url); return [normalized]; });
    return { items, status: "OK" };
  } catch { return { items: [], status: "ERROR" }; }
}
