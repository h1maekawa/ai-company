import type { ContentPlatform } from "../brandProfile";
import type { PerformanceSnapshot, PublishedContent, RevenueEvent } from "../monetization/types";
import type { ContentPerformance } from "../../note/research/types";
import type { PlatformMetricValues, PlatformPerformanceProjection, PlatformPerformanceRecord } from "./types";

const emptyMetrics = (): PlatformMetricValues => ({
  impressions: null, views: null, likes: null, comments: null, replies: null, reposts: null,
  saves: null, shares: null, profileVisits: null, followersGained: null, linkClicks: null,
  conversions: null, revenue: null,
});

const observed = (value: number | null | undefined): number | null => value === null || value === undefined ? null : value;

function latestSnapshots(snapshots: PerformanceSnapshot[]): Map<string, PerformanceSnapshot> {
  const latest = new Map<string, PerformanceSnapshot>();
  for (const snapshot of snapshots) {
    const current = latest.get(snapshot.publishedContentId);
    if (!current || snapshot.capturedAt > current.capturedAt) latest.set(snapshot.publishedContentId, snapshot);
  }
  return latest;
}

function attributedRevenue(events: RevenueEvent[]): Map<string, { value: number; sourceId?: string }> {
  const byContent = new Map<string, { value: number; sourceId?: string }>();
  for (const event of events) {
    const current = byContent.get(event.publishedContentId);
    byContent.set(event.publishedContentId, { value: (current?.value ?? 0) + event.amount, sourceId: current?.sourceId ?? event.id });
  }
  return byContent;
}

function publishedIndexes(published: PublishedContent[]) {
  const byId = new Map(published.map((item) => [item.id, item]));
  const byContent = new Map<string, PublishedContent>();
  for (const item of published) {
    byContent.set(item.contentId, item);
    if (item.draftId) byContent.set(item.draftId, item);
  }
  return { byId, byContent };
}

function contentMetrics(record: ContentPerformance): PlatformMetricValues {
  if (record.platform === "note") return {
    ...emptyMetrics(),
    views: observed(record.noteViews),
    likes: observed(record.noteLikes),
    conversions: observed(record.noteSales ?? record.paidPurchases),
    revenue: null,
    followersGained: observed(record.noteFollowers),
    linkClicks: observed(record.affiliateClicks ?? record.linkClicks),
  };
  return {
    ...emptyMetrics(),
    impressions: observed(record.impressions),
    likes: observed(record.likes),
    replies: observed(record.replies),
    reposts: observed(record.reposts),
    saves: observed(record.bookmarks),
    profileVisits: observed(record.profileVisits),
    followersGained: observed(record.followersGained),
    linkClicks: observed(record.linkClicks ?? record.urlClicks ?? record.noteClicks),
    conversions: observed(record.affiliateConversions),
    revenue: null,
  };
}

function snapshotMetrics(snapshot: PerformanceSnapshot): PlatformMetricValues {
  return {
    ...emptyMetrics(),
    impressions: observed(snapshot.impressions), views: observed(snapshot.views), likes: observed(snapshot.likes),
    comments: observed(snapshot.comments), replies: observed(snapshot.replies), reposts: observed(snapshot.reposts),
    saves: observed(snapshot.bookmarks), profileVisits: observed(snapshot.profileVisits), followersGained: observed(snapshot.follows),
    linkClicks: observed(snapshot.linkClicks), conversions: observed(snapshot.conversions), revenue: null,
  };
}

/** Platform-specific ContentPerformance wins. Snapshot is only used when no primary record exists. */
export function adaptPlatformPerformance(input: {
  platform: ContentPlatform;
  performance: ContentPerformance[];
  snapshots?: PerformanceSnapshot[];
  published?: PublishedContent[];
  revenueEvents?: RevenueEvent[];
}): PlatformPerformanceProjection {
  if (input.platform === "instagram") return { platform: "instagram", records: [], freshness: "not_configured" };
  const published = input.published ?? [];
  const indexes = publishedIndexes(published);
  const snapshotByPublishedId = latestSnapshots(input.snapshots ?? []);
  const revenueByPublishedId = attributedRevenue(input.revenueEvents ?? []);
  const primaryContentIds = new Set<string>();
  const records: PlatformPerformanceRecord[] = input.performance.filter((record) => record.platform === input.platform).map((record) => {
    primaryContentIds.add(record.contentId);
    const publication = indexes.byContent.get(record.contentId) ?? (record.publishedContentId ? indexes.byId.get(record.publishedContentId) : undefined);
    const ledgerRevenue = publication ? revenueByPublishedId.get(publication.id) : undefined;
    const metrics = contentMetrics(record);
    if (ledgerRevenue) metrics.revenue = ledgerRevenue.value;
    return {
      platform: input.platform,
      contentId: record.contentId,
      publishedContentId: publication?.id ?? record.publishedContentId,
      contentGoal: publication?.contentGoal,
      publishedAt: record.publishedAt,
      observedAt: record.measuredAt || null,
      freshness: record.metricsStale === true ? "stale" : record.measuredAt ? "fresh" : "unavailable",
      metrics,
      source: { kind: "content-performance", sourceId: record.contentId },
    };
  });

  for (const [publishedContentId, snapshot] of snapshotByPublishedId) {
    const publication = indexes.byId.get(publishedContentId);
    if (!publication || publication.channel !== input.platform || primaryContentIds.has(publication.contentId) || (publication.draftId && primaryContentIds.has(publication.draftId))) continue;
    const metrics = snapshotMetrics(snapshot);
    const ledgerRevenue = revenueByPublishedId.get(publication.id);
    if (ledgerRevenue) metrics.revenue = ledgerRevenue.value;
    records.push({
      platform: input.platform,
      contentId: publication.contentId,
      publishedContentId,
      contentGoal: publication.contentGoal,
      publishedAt: publication.publishedAt,
      observedAt: snapshot.capturedAt || null,
      freshness: snapshot.capturedAt ? "fresh" : "unavailable",
      metrics,
      source: { kind: "performance-snapshot", sourceId: snapshot.id },
    });
  }
  const freshness = records.some((record) => record.freshness === "fresh") ? "fresh"
    : records.some((record) => record.freshness === "stale") ? "stale" : "unavailable";
  return { platform: input.platform, records, freshness };
}
