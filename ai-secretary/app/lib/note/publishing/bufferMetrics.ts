import type { ContentPerformance, SocialDraft } from "../research/types";
import { getPost, type BufferPostMetric, type BufferPostNode } from "./buffer";
import type { PerformanceProvider, PerformanceProviderResult } from "./performanceProvider";

type BufferPostFetcher = typeof getPost;

export function isDailyMetricsCandidate(draft: SocialDraft, now = new Date()): boolean {
  if (!draft.scheduledAt || !draft.bufferPostId) return false;
  const tokyoDate = new Date(now.getTime() + 9 * 3_600_000).toISOString().slice(0, 10);
  const todayStartedAt = new Date(`${tokyoDate}T00:00:00+09:00`).getTime();
  return new Date(draft.scheduledAt).getTime() < todayStartedAt;
}

export function hasNewerBufferMetrics(
  draft: SocialDraft,
  providerUpdatedAt: string,
  existingRecord: boolean
): boolean {
  if (!existingRecord || !draft.bufferMetricsUpdatedAt) return true;
  const previous = new Date(draft.bufferMetricsUpdatedAt).getTime();
  const incoming = new Date(providerUpdatedAt).getTime();
  return !Number.isFinite(previous) || !Number.isFinite(incoming) || incoming > previous;
}

const PERFORMANCE_VALUE_KEYS = [
  "impressions", "likes", "replies", "reposts", "engagements", "linkClicks",
  "profileVisits", "followersGained", "noteClicks",
] as const;

export function samePerformanceValues(a: ContentPerformance, b: ContentPerformance): boolean {
  return PERFORMANCE_VALUE_KEYS.every((key) => a[key] === b[key]);
}

function metricMap(metrics: BufferPostMetric[]): Map<string, number> {
  const result = new Map<string, number>();
  for (const metric of metrics) {
    if (typeof metric.type !== "string" || typeof metric.value !== "number" || !Number.isFinite(metric.value)) {
      continue;
    }
    result.set(metric.type, metric.value);
  }
  return result;
}

function availability(value: number | undefined): "available" | "unavailable" {
  return value === undefined ? "unavailable" : "available";
}

/** Buffer固有shapeを共通ContentPerformanceへ閉じ込めて正規化する。 */
export function normalizeBufferMetrics(
  draft: SocialDraft,
  post: BufferPostNode,
  measuredAt = new Date()
): ContentPerformance | null {
  if (!Array.isArray(post.metrics) || !post.metricsUpdatedAt) return null;
  const values = metricMap(post.metrics);
  const impressions = values.get("impressions");
  const likes = values.get("reactions");
  const replies = values.get("comments");
  const reposts = values.get("reposts");
  const linkClicks = values.get("clicks");
  return {
    contentId: draft.id,
    trendClusterId: draft.trendClusterId,
    platform: "x",
    purpose: draft.purpose,
    genreId: draft.genreId,
    publishedAt: post.sentAt ?? post.dueAt ?? draft.scheduledAt ?? measuredAt.toISOString(),
    impressions,
    likes,
    replies,
    reposts,
    linkClicks,
    measuredAt: measuredAt.toISOString(),
    metricAvailability: {
      impressions: availability(impressions),
      likes: availability(likes),
      replies: availability(replies),
      reposts: availability(reposts),
      engagements: "unavailable",
      linkClicks: availability(linkClicks),
      profileVisits: "unavailable",
      followersGained: "unavailable",
      noteClicks: "unavailable",
    },
  };
}

export async function fetchBufferMetrics(
  draft: SocialDraft,
  now = new Date(),
  fetchPost: BufferPostFetcher = getPost
): Promise<PerformanceProviderResult> {
  if (!draft.bufferPostId) return { ok: false, retryable: false, error: "Buffer Post ID is not configured" };
  const result = await fetchPost(draft.bufferPostId);
  if (result.ok === false) return { ok: false, retryable: true, error: result.error.message };
  const post = result.data;
  if (!post) return { ok: false, retryable: true, error: "Buffer post was not found" };
  if (post.status !== "sent") return { ok: false, retryable: true, error: `Buffer post is not sent (${post.status ?? "unknown"})` };
  const metrics = normalizeBufferMetrics(draft, post, now);
  if (!metrics || !post.metricsUpdatedAt) {
    return { ok: false, retryable: true, error: "Buffer metrics are not available yet" };
  }
  if (!Object.values(metrics.metricAvailability ?? {}).includes("available")) {
    return { ok: false, retryable: true, error: "Buffer returned no supported metrics" };
  }
  return {
    ok: true,
    metrics,
    providerUpdatedAt: post.metricsUpdatedAt,
    externalLink: post.externalLink,
  };
}

/** 現在のPrimary。将来は同じinterfaceのX AdapterとMerge層を追加できる。 */
export const bufferMetricsProvider: PerformanceProvider = {
  id: "buffer",
  fetch: (draft, now) => fetchBufferMetrics(draft, now),
};
