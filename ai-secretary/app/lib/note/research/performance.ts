import type { ContentPerformance, RevenueSharingProgress } from "./types";
import type { ContentPillar } from "../types";

const rate = (value?: number, base?: number): number | undefined =>
  value === undefined || base === undefined || base <= 0 ? undefined : value / base;

export function performanceRates(record: ContentPerformance) {
  return {
    likeRate: rate(record.likes, record.impressions),
    replyRate: rate(record.replies, record.impressions),
    repostRate: rate(record.reposts, record.impressions),
    quoteRate: rate(record.quotes, record.impressions),
    bookmarkRate: rate(record.bookmarks, record.impressions),
    profileClickRate: rate(record.profileClicks, record.impressions),
    followConversionRate: rate(record.followsFromPost, record.profileClicks),
    urlClickRate: rate(record.urlClicks ?? record.linkClicks, record.impressions),
    engagementRate:
      record.impressions && record.impressions > 0
        ? [record.likes, record.replies, record.reposts, record.quotes, record.bookmarks]
            .filter((value): value is number => value !== undefined)
            .reduce((sum, value) => sum + value, 0) / record.impressions
        : undefined,
    followerNet: record.currentFollowerCount !== undefined && record.followerCountAtPost !== undefined
      ? record.currentFollowerCount - record.followerCountAtPost
      : undefined,
  };
}

export function timeBand(iso: string): string {
  const hour = new Date(iso).getHours();
  const start = hour < 6 ? 0 : hour >= 24 ? 21 : Math.floor(hour / 3) * 3;
  return `${String(start).padStart(2, "0")}:00〜${String(start + 3).padStart(2, "0")}:00`;
}

export function summarizePerformance(records: ContentPerformance[]) {
  const x = records.filter((record) => record.platform === "x");
  const byBand = new Map<string, { posts: number; impressions: number; measured: number }>();
  for (const record of x) {
    const key = timeBand(record.publishedAt);
    const value = byBand.get(key) ?? { posts: 0, impressions: 0, measured: 0 };
    value.posts += 1;
    if (record.impressions !== undefined) {
      value.impressions += record.impressions;
      value.measured += 1;
    }
    byBand.set(key, value);
  }
  return {
    postCount: x.length,
    totalImpressions: x.some((record) => record.impressions !== undefined)
      ? x.reduce((sum, record) => sum + (record.impressions ?? 0), 0)
      : undefined,
    byTimeBand: [...byBand.entries()].map(([band, value]) => ({
      band,
      posts: value.posts,
      averageImpressions: value.measured ? value.impressions / value.measured : undefined,
    })),
    enoughForTrend: x.length >= 10,
    recommendedConfidence: x.length >= 30 ? "十分" : x.length >= 10 ? "参考" : "データ不足",
    noteRevenue: records.some((record) => record.noteRevenue !== undefined)
      ? records.reduce((sum, record) => sum + (record.noteRevenue ?? 0), 0)
      : undefined,
    affiliateRevenue: records.some((record) => record.affiliateRevenue !== undefined)
      ? records.reduce((sum, record) => sum + (record.affiliateRevenue ?? 0), 0)
      : undefined,
  };
}

export function learningSignals(records: ContentPerformance[]) {
  const completed = records.filter((record) => record.platform === "x" && record.impressions !== undefined);
  const averageBy = (key: "genreId" | "pattern") => {
    const groups = new Map<string, number[]>();
    for (const record of completed) {
      const value = record[key];
      if (!value) continue;
      groups.set(value, [...(groups.get(value) ?? []), record.impressions!]);
    }
    return [...groups.entries()]
      .map(([id, values]) => ({ id, posts: values.length, averageImpressions: values.reduce((a, b) => a + b, 0) / values.length }))
      .sort((a, b) => b.averageImpressions - a.averageImpressions);
  };
  return {
    genres: averageBy("genreId"),
    patterns: averageBy("pattern"),
    preferredGenreIds: completed.length >= 10 ? averageBy("genreId").slice(0, 2).map((item) => item.id) : [],
    message: completed.length < 10 ? "10投稿以上で次回候補への参考傾向を表示します。" : "実績の良いジャンルを次回候補の同点時に優先します。",
  };
}

export function monetizationProjection(progress: RevenueSharingProgress) {
  const current = progress.organicImpressions90Days;
  const remainingImpressions = current === undefined
    ? undefined
    : Math.max(0, progress.requiredOrganicImpressions - current);
  return {
    remainingImpressions,
    requiredDailyAverage: remainingImpressions === undefined ? undefined : remainingImpressions / 90,
    verifiedFollowersRemaining: progress.verifiedFollowers === undefined
      ? undefined
      : Math.max(0, progress.requiredVerifiedFollowers - progress.verifiedFollowers),
  };
}

export function contentPillarBalance(records: ContentPerformance[], pillars: ContentPillar[]) {
  const latest = records
    .filter((record) => record.platform === "x")
    .sort((a, b) => b.publishedAt.localeCompare(a.publishedAt))
    .slice(0, 30);
  return pillars.map((pillar) => {
    const count = latest.filter((record) => record.genreId === pillar.id).length;
    const currentRatio = latest.length ? Math.round((count / latest.length) * 100) : 0;
    return {
      id: pillar.id,
      label: pillar.label,
      targetRatio: pillar.targetRatio,
      currentRatio,
      difference: currentRatio - pillar.targetRatio,
    };
  });
}
