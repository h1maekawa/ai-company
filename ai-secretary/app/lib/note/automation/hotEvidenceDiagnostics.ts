import type { ResearchItem, TrendCluster } from "../research/types";

/** Metadata only: never emit research excerpts or candidate text to logs. */
export function hotEvidenceDiagnostics(clusters: TrendCluster[], items: ResearchItem[]) {
  const byId = new Map(items.map((item) => [item.id, item]));
  return clusters.map((cluster) => {
    const sources = cluster.researchItemIds.map((id) => byId.get(id)).filter((item): item is ResearchItem => Boolean(item));
    const sourceIdentity = (item: ResearchItem) => {
      if (item.sourceAccountId) return `${item.platform}:account:${item.sourceAccountId}`;
      try { return `${item.platform}:host:${new URL(item.sourceUrl).hostname.toLowerCase().replace(/^www\./, "")}`; }
      catch { return `${item.platform}:host:unknown`; }
    };
    return {
      clusterId: cluster.id,
      hotScore: cluster.hotScore ?? null,
      hotConfidence: cluster.hotConfidence ?? null,
      availableWeight: cluster.hotScoreBreakdown?.availableWeight ?? null,
      measuredPostCount: cluster.hotScoreBreakdown?.measuredPostCount ?? null,
      independentSourceCount: new Set(sources.map(sourceIdentity)).size,
      hasMomentum: sources.some((item) => item.publicMetrics && [item.publicMetrics.likes, item.publicMetrics.replies, item.publicMetrics.reposts].some((value) => value !== undefined)),
      hasFreshness: sources.some((item) => item.publishedAt && Number.isFinite(Date.parse(item.publishedAt))),
      sourceCount: cluster.sourceCount,
    };
  });
}
