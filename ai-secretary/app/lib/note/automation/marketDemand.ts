import type { ContentPerformance, ResearchItem, TrendCluster } from "../research/types";

export type SignalAvailability = "AVAILABLE" | "UNAVAILABLE" | "STALE";
export type MarketDemandSignal = { availability: SignalAvailability; value?: number; evidenceRefs: string[] };
export type MarketDemand = {
  score: number | null;
  coverage: number;
  confidence: "LOW" | "MEDIUM" | "HIGH";
  signals: Record<"xEngagement" | "velocity" | "newsVolume" | "sourceDiversity" | "googleTrends" | "webInterest" | "ownPerformance", MarketDemandSignal>;
};

const DAY = 86_400_000;
const observed = (values: Array<number | undefined>) => values.filter((value): value is number => value !== undefined);
const host = (url: string) => { try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return ""; } };

/** Available signalsだけを再正規化する。Google Trendsは安全な既存providerがないため明示的にUNAVAILABLE。 */
export function computeMarketDemand(cluster: TrendCluster, items: ResearchItem[], performance: ContentPerformance[], now = new Date()): MarketDemand {
  const evidence = items.filter((item) => cluster.researchItemIds.includes(item.id));
  const fresh = evidence.filter((item) => now.getTime() - new Date(item.publishedAt ?? item.fetchedAt).getTime() <= 72 * 3_600_000);
  const metrics = observed(evidence.flatMap((item) => item.publicMetrics ? [item.publicMetrics.likes, item.publicMetrics.replies, item.publicMetrics.reposts, item.publicMetrics.impressions] : []));
  const domains = [...new Set(evidence.map((item) => host(item.sourceUrl)).filter(Boolean))];
  const own = performance.filter((record) => record.platform === "x" && record.trendClusterId === cluster.id && record.impressions !== undefined && now.getTime() - new Date(record.publishedAt).getTime() <= 30 * DAY);
  const signal = (available: boolean, value: number | undefined, refs: string[], stale = false): MarketDemandSignal => available
    ? { availability: stale ? "STALE" : "AVAILABLE", value, evidenceRefs: refs }
    : { availability: "UNAVAILABLE", evidenceRefs: [] };
  const signals: MarketDemand["signals"] = {
    xEngagement: signal(metrics.length > 0, metrics.length ? metrics.reduce((a, b) => a + b, 0) / metrics.length : undefined, evidence.map((item) => item.id)),
    velocity: signal(fresh.some((item) => item.publicMetrics), fresh.filter((item) => item.publicMetrics).length, fresh.map((item) => item.id)),
    newsVolume: signal(evidence.length > 0, fresh.length, fresh.map((item) => item.id), evidence.length > 0 && fresh.length === 0),
    sourceDiversity: signal(domains.length > 0, domains.length, evidence.map((item) => item.id)),
    googleTrends: { availability: "UNAVAILABLE", evidenceRefs: [] },
    webInterest: signal(fresh.some((item) => item.platform === "web"), fresh.filter((item) => item.platform === "web").length, fresh.filter((item) => item.platform === "web").map((item) => item.id)),
    ownPerformance: signal(own.length > 0, own.length ? own.reduce((sum, item) => sum + item.impressions!, 0) / own.length : undefined, own.map((item) => item.contentId)),
  };
  const weights: Record<keyof typeof signals, number> = { xEngagement: 20, velocity: 15, newsVolume: 15, sourceDiversity: 15, googleTrends: 10, webInterest: 10, ownPerformance: 15 };
  const available = (Object.keys(signals) as Array<keyof typeof signals>).filter((key) => signals[key].availability === "AVAILABLE" && signals[key].value !== undefined);
  const availableWeight = available.reduce((sum, key) => sum + weights[key], 0);
  const raw = available.reduce((sum, key) => sum + Math.min(100, Math.log1p(signals[key].value!) * 20) * weights[key], 0);
  const coverage = availableWeight / 100;
  return { score: availableWeight ? Math.round(raw / availableWeight) : null, coverage, confidence: coverage >= .7 ? "HIGH" : coverage >= .4 ? "MEDIUM" : "LOW", signals };
}

export function attachMarketDemandRankingSignal(candidates: TrendCluster[], items: ResearchItem[], performance: ContentPerformance[], now = new Date()): TrendCluster[] {
  return candidates.map((candidate) => {
    const demand = computeMarketDemand(candidate, items, performance, now);
    return {
      ...candidate,
      marketDemand: { score: demand.score, coverage: demand.coverage, confidence: demand.confidence },
    };
  });
}
