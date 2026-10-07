import type { PublicMetrics, ResearchItem } from "./types";

/** Only provider-observed metadata may refresh a previously abstracted item. */
export function mergeObservedResearchEvidence(existing: ResearchItem, observed: ResearchItem): ResearchItem {
  if (existing.sourceUrl !== observed.sourceUrl) return existing;
  const metrics: PublicMetrics = { ...existing.publicMetrics };
  for (const key of ["likes", "replies", "reposts", "impressions", "followers"] as const) {
    const value = observed.publicMetrics?.[key];
    if (typeof value === "number" && Number.isFinite(value) && value >= 0) metrics[key] = value;
  }
  const publishedAt = existing.publishedAt && Number.isFinite(Date.parse(existing.publishedAt))
    ? existing.publishedAt
    : observed.publishedAt && Number.isFinite(Date.parse(observed.publishedAt)) ? observed.publishedAt : existing.publishedAt;
  return {
    ...existing,
    ...(observed.sourceAccountId ? { sourceAccountId: observed.sourceAccountId } : {}),
    ...(observed.sourceRole && !existing.sourceRole ? { sourceRole: observed.sourceRole } : {}),
    ...(publishedAt ? { publishedAt } : {}),
    ...(Object.keys(metrics).length > 0 ? { publicMetrics: metrics } : {}),
    fetchedAt: observed.fetchedAt,
  };
}

/** Deduplicate this run by exact URL, then refresh existing evidence without changing excerpts or abstracted patterns. */
export function reconcileFetchedResearchItems(existing: ResearchItem[], fetched: ResearchItem[]) {
  const byUrl = new Map<string, ResearchItem>();
  for (const item of fetched) {
    const previous = byUrl.get(item.sourceUrl);
    byUrl.set(item.sourceUrl, previous ? mergeObservedResearchEvidence(previous, item) : item);
  }
  const fresh = [...byUrl.values()].filter((item) => !existing.some((old) => old.sourceUrl === item.sourceUrl));
  const refreshed = existing.map((item) => {
    const observed = byUrl.get(item.sourceUrl);
    return observed ? mergeObservedResearchEvidence(item, observed) : item;
  });
  return { fresh, refreshed };
}
