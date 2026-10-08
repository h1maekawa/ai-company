import type { ResearchItem, TrendCluster } from "../research/types";

/** Metadata only: never emit research excerpts or candidate text to logs. */
export function hotEvidenceDiagnostics(clusters: TrendCluster[], items: ResearchItem[], now = new Date()) {
  const byId = new Map(items.map((item) => [item.id, item]));
  return clusters.map((cluster) => {
    const sources = cluster.researchItemIds.map((id) => byId.get(id)).filter((item): item is ResearchItem => Boolean(item));
    const validPublishedAt = sources.flatMap((item) => item.publishedAt && Number.isFinite(Date.parse(item.publishedAt)) ? [item.publishedAt] : []);
    const publicMetricCount = sources.filter((item) => item.publicMetrics && Object.values(item.publicMetrics).some((value) => typeof value === "number")).length;
    const invalidUrls = sources.filter((item) => { try { new URL(item.sourceUrl); return false; } catch { return true; } }).length;
    const canonicalUrls = new Set(sources.flatMap((item) => {
      try { const url = new URL(item.sourceUrl); url.hash = ""; url.search = ""; return [url.toString().replace(/\/$/, "")]; }
      catch { return []; }
    }));
    const sourceIdentity = (item: ResearchItem) => {
      if (item.sourceAccountId) return `${item.platform}:account:${item.sourceAccountId}`;
      try { return `${item.platform}:host:${new URL(item.sourceUrl).hostname.toLowerCase().replace(/^www\./, "")}`; }
      catch { return `${item.platform}:host:unknown`; }
    };
    const independentSourceCount = new Set(sources.map(sourceIdentity)).size;
    const availableWeight = cluster.hotScoreBreakdown?.availableWeight ?? null;
    const rootCauses: string[] = [];
    if (sources.length === 0) rootCauses.push("PROVIDER_DATA_MISSING");
    if (publicMetricCount === 0) rootCauses.push("PUBLIC_METRICS_MISSING");
    if (validPublishedAt.length < sources.length) rootCauses.push("PUBLISHED_AT_MISSING");
    if (independentSourceCount < 2) rootCauses.push("INDEPENDENT_SOURCE_INSUFFICIENT");
    if (availableWeight !== null && availableWeight < 70) rootCauses.push("AVAILABLE_WEIGHT_INSUFFICIENT");
    if (validPublishedAt.length > 0 && validPublishedAt.every((value) => now.getTime() - Date.parse(value) > 7 * 86_400_000)) rootCauses.push("STALE_SOURCE");
    if (invalidUrls > 0 || (canonicalUrls.size < sources.length && independentSourceCount > canonicalUrls.size)) rootCauses.push("SOURCE_NORMALIZATION_ERROR");
    if (sources.some((item) => !item.sourceAccountId)) rootCauses.push("AUTHOR_IDENTITY_MISSING");
    if (cluster.hotConfidence === "LOW" && rootCauses.length === 0) rootCauses.push("EXPECTED_LOW");
    return {
      clusterId: cluster.id,
      hotScore: cluster.hotScore ?? null,
      hotConfidence: cluster.hotConfidence ?? null,
      availableWeight,
      measuredPostCount: cluster.hotScoreBreakdown?.measuredPostCount ?? null,
      independentSourceCount,
      hasMomentum: sources.some((item) => item.publicMetrics && [item.publicMetrics.likes, item.publicMetrics.replies, item.publicMetrics.reposts].some((value) => value !== undefined)),
      hasFreshness: sources.some((item) => item.publishedAt && Number.isFinite(Date.parse(item.publishedAt))),
      sourceCount: cluster.sourceCount,
      publicMetricCount,
      publishedAtCount: validPublishedAt.length,
      uniqueUrlCount: canonicalUrls.size,
      uniqueDomainCount: new Set(sources.flatMap((item) => { try { return [new URL(item.sourceUrl).hostname.toLowerCase().replace(/^www\./, "")]; } catch { return []; } })).size,
      uniqueAuthorCount: new Set(sources.flatMap((item) => item.sourceAccountId ? [item.sourceAccountId] : [])).size,
      providerCount: new Set(sources.map((item) => item.platform)).size,
      rootCauses,
    };
  });
}
