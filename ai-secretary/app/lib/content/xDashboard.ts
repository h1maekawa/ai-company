import { deriveMetrics } from "./monetization/metrics";
import type { PublishedContent, RevenueEvent } from "./monetization/types";
import type { DailyGrowthReview, MetricSummary } from "../note/growthLoop";
import { buildContentDashboardGrowth } from "../note/contentDashboardGrowth";
import { tokyoDateKey } from "../note/tokyoDate";
import type { ContentPerformance, DailyXPlan, SocialDraft, SocialOperationMode } from "../note/research/types";
import type { PerformanceSnapshot } from "./monetization/types";
import { adaptPlatformPerformance } from "./platform-intelligence/adapters";
import type { PlatformPerformanceRecord } from "./platform-intelligence/types";

export type XDashboardRange = "today" | "sevenDays" | "thirtyDays";

export type XDashboardMetricSet = MetricSummary & {
  averageImpressionsPerPost: number | null;
  revenue: number | null;
  revenuePer1000Impressions: number | null;
};

export type XDashboardData = {
  generatedAt: string;
  mode: SocialOperationMode;
  metrics: Record<XDashboardRange, XDashboardMetricSet>;
  trend: { date: string; posts: number; impressions: number | null }[];
  todayContent: { id: string; scheduledTime: string; status: string; excerpt: string | null; draftId: string | null }[];
  queue: { scheduled: number; review: number; blocked: number; href: string };
  attention: { id: string; title: string; detail: string | null }[];
  topContent: {
    id: string;
    excerpt: string;
    publishedAt: string;
    impressions: number | null;
    engagement: number | null;
    replies: number | null;
    profileVisits: number | null;
    linkClicks: number | null;
    revenue: number | null;
  }[];
  availableRankings: ("impressions" | "engagement" | "traffic" | "revenue")[];
  learning: ReturnType<typeof buildContentDashboardGrowth>;
  revenue: { available: boolean; total: number | null; byType: Record<string, number> };
  dataAsOf: string | null;
};

const DAY = 86_400_000;

function recordsInRange(records: PlatformPerformanceRecord[], range: XDashboardRange, now: Date): PlatformPerformanceRecord[] {
  // Stale evidence remains in the projection, but never becomes current KPI truth.
  const fresh = records.filter((record) => record.freshness === "fresh");
  if (range === "today") return fresh.filter((record) => tokyoDateKey(new Date(record.publishedAt)) === tokyoDateKey(now));
  const days = range === "sevenDays" ? 7 : 30;
  const cutoff = now.getTime() - days * DAY;
  return fresh.filter((record) => {
    const time = new Date(record.publishedAt).getTime();
    return Number.isFinite(time) && time >= cutoff && time <= now.getTime();
  });
}

function sumObserved(records: PlatformPerformanceRecord[], getter: (record: PlatformPerformanceRecord) => number | null): number | null {
  const values = records.map(getter).filter((value): value is number => value !== null);
  return values.length ? values.reduce((sum, value) => sum + value, 0) : null;
}

function xRevenueEvents(published: PublishedContent[], revenueEvents: RevenueEvent[]): RevenueEvent[] {
  const ids = new Set(published.filter((item) => item.channel === "x").map((item) => item.id));
  return revenueEvents.filter((event) => ids.has(event.publishedContentId));
}

function summarizeCanonicalX(records: PlatformPerformanceRecord[]): MetricSummary {
  const sum = (metric: keyof PlatformPerformanceRecord["metrics"]) => sumObserved(records, (record) => record.metrics[metric]);
  const engagement = records.map((record) => [record.metrics.likes, record.metrics.replies, record.metrics.reposts] as (number | null)[])
    .filter((values) => values.some((value) => value !== null));
  return {
    postCount: records.length,
    impressions: sum("impressions") ?? undefined,
    engagements: engagement.length ? engagement.reduce<number>((total, values) => total + values.reduce<number>((row, value) => row + (value ?? 0), 0), 0) : undefined,
    linkClicks: sum("linkClicks") ?? undefined,
    profileVisits: sum("profileVisits") ?? undefined,
    followersGained: sum("followersGained") ?? undefined,
    likes: sum("likes") ?? undefined,
    replies: sum("replies") ?? undefined,
    reposts: sum("reposts") ?? undefined,
    bookmarks: sum("saves") ?? undefined,
  };
}

function metricSet(records: PlatformPerformanceRecord[]): XDashboardMetricSet {
  const summary = summarizeCanonicalX(records);
  const revenue = sumObserved(records, (record) => record.metrics.revenue);
  const derived = deriveMetrics({
    impressions: summary.impressions,
    linkClicks: summary.linkClicks,
    totalRevenue: revenue ?? undefined,
    contentCount: summary.postCount || undefined,
  });
  return {
    ...summary,
    averageImpressionsPerPost: summary.impressions === undefined || summary.postCount === 0
      ? null
      : summary.impressions / summary.postCount,
    revenue,
    revenuePer1000Impressions: derived.revenuePer1000Impressions ?? null,
  };
}

function dailyTrend(records: PlatformPerformanceRecord[]): XDashboardData["trend"] {
  const byDate = new Map<string, PlatformPerformanceRecord[]>();
  for (const record of records) {
    const date = tokyoDateKey(new Date(record.publishedAt));
    byDate.set(date, [...(byDate.get(date) ?? []), record]);
  }
  return [...byDate.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([date, items]) => ({
    date,
    posts: items.length,
    impressions: sumObserved(items, (item) => item.metrics.impressions),
  }));
}

function attention(plans: DailyXPlan[], drafts: SocialDraft[], today: string): XDashboardData["attention"] {
  const items: XDashboardData["attention"] = [];
  for (const plan of plans.filter((item) => item.date === today)) {
    for (const slot of plan.slots) {
      if (!["failed", "ambiguous", "blocked"].includes(slot.status)) continue;
      const title = slot.status === "ambiguous" ? "Ambiguous Publish" : slot.status === "blocked" ? "Safety / Fact Block" : "Publish Failed";
      items.push({ id: slot.id, title, detail: slot.failureKind ?? slot.failureReason ?? null });
    }
  }
  for (const draft of drafts.filter((item) => item.failureReason || item.metricsSyncError)) {
    items.push({ id: draft.id, title: draft.metricsSyncError ? "Buffer Error" : "Publish Failed", detail: draft.metricsSyncError ?? draft.failureReason ?? null });
  }
  return items.filter((item, index, all) => all.findIndex((candidate) => candidate.id === item.id && candidate.title === item.title) === index);
}

export function buildXDashboard(input: {
  now?: Date;
  mode: SocialOperationMode;
  records: ContentPerformance[];
  snapshots?: PerformanceSnapshot[];
  reviews: DailyGrowthReview[];
  plans: DailyXPlan[];
  drafts: SocialDraft[];
  published: PublishedContent[];
  revenueEvents: RevenueEvent[];
}): XDashboardData {
  const now = input.now ?? new Date();
  const today = tokyoDateKey(now);
  const currentPlan = input.plans.find((plan) => plan.date === today) ?? null;
  const draftById = new Map(input.drafts.map((draft) => [draft.id, draft]));
  const projection = adaptPlatformPerformance({ platform: "x", performance: input.records, snapshots: input.snapshots, published: input.published, revenueEvents: input.revenueEvents });
  const thirtyDays = recordsInRange(projection.records, "thirtyDays", now);
  const revenueEvents = xRevenueEvents(input.published, input.revenueEvents);
  const publishedByContent = new Map<string, PublishedContent>();
  for (const item of input.published.filter((item) => item.channel === "x")) {
    publishedByContent.set(item.contentId, item);
    if (item.draftId) publishedByContent.set(item.draftId, item);
  }

  const topContent = [...thirtyDays]
    .sort((a, b) => (b.metrics.impressions ?? -1) - (a.metrics.impressions ?? -1))
    .slice(0, 5)
    .map((record) => {
      const draft = draftById.get(record.contentId);
      const pub = publishedByContent.get(record.contentId);
      const engagementValues = [record.metrics.likes, record.metrics.replies, record.metrics.reposts].filter((value): value is number => value !== null);
      return {
        id: record.contentId,
        excerpt: (draft?.text ?? pub?.bodySummary ?? pub?.title ?? record.contentId).slice(0, 90),
        publishedAt: record.publishedAt,
        impressions: record.metrics.impressions,
        engagement: engagementValues.length ? engagementValues.reduce((sum, value) => sum + value, 0) : null,
        replies: record.metrics.replies,
        profileVisits: record.metrics.profileVisits,
        linkClicks: record.metrics.linkClicks,
        revenue: record.metrics.revenue,
      };
    });

  const availableRankings: XDashboardData["availableRankings"] = [];
  if (topContent.some((item) => item.impressions !== null)) availableRankings.push("impressions");
  if (topContent.some((item) => item.engagement !== null)) availableRankings.push("engagement");
  if (topContent.some((item) => item.profileVisits !== null || item.linkClicks !== null)) availableRankings.push("traffic");
  if (topContent.some((item) => item.revenue !== null)) availableRankings.push("revenue");

  const latestReview = [...input.reviews].sort((a, b) => b.date.localeCompare(a.date))[0];
  const measuredTimes = projection.records.filter((record) => record.freshness === "fresh").map((record) => record.observedAt).filter((value): value is string => Boolean(value)).sort();

  return {
    generatedAt: now.toISOString(),
    mode: input.mode,
    metrics: {
      today: metricSet(recordsInRange(projection.records, "today", now)),
      sevenDays: metricSet(recordsInRange(projection.records, "sevenDays", now)),
      thirtyDays: metricSet(thirtyDays),
    },
    trend: dailyTrend(thirtyDays),
    todayContent: (currentPlan?.slots ?? []).map((slot) => {
      const draft = slot.draftId ? draftById.get(slot.draftId) : undefined;
      return { id: slot.id, scheduledTime: slot.scheduledTime, status: slot.status, excerpt: draft?.text.slice(0, 90) ?? null, draftId: slot.draftId ?? null };
    }),
    queue: {
      scheduled: input.drafts.filter((draft) => draft.status === "queued" || draft.status === "scheduled").length,
      review: input.drafts.filter((draft) => draft.status === "draft" || draft.status === "approved").length,
      blocked: input.drafts.filter((draft) => draft.status === "failed").length,
      href: "/content/x?view=content",
    },
    attention: attention(input.plans, input.drafts, today),
    topContent,
    availableRankings,
    learning: buildContentDashboardGrowth(latestReview),
    revenue: {
      available: revenueEvents.length > 0,
      total: revenueEvents.length ? revenueEvents.reduce((sum, event) => sum + event.amount, 0) : null,
      byType: Object.fromEntries(revenueEvents.reduce((map, event) => map.set(event.type, (map.get(event.type) ?? 0) + event.amount), new Map<string, number>())),
    },
    dataAsOf: measuredTimes.at(-1) ?? null,
  };
}
