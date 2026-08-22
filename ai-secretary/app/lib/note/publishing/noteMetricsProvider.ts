import type { ContentPerformance, NoteArticleDraft } from "../research/types";

export type NoteMetricsResult =
  | { ok: true; metrics: ContentPerformance; providerUpdatedAt: string }
  | { ok: false; retryable: boolean; error: string };

/** official / Playwright / manualを差し替えるためのread-only境界。 */
export interface NoteMetricsProvider {
  id: string;
  fetch(article: NoteArticleDraft, now?: Date): Promise<NoteMetricsResult>;
}

export type NoteMetricsPayload = {
  views?: number;
  likes?: number;
  sales?: number;
  revenue?: number;
  followers?: number;
  measuredAt?: string;
};

const metric = (value: unknown): number | undefined =>
  typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : undefined;

/** Mac runnerのread-only取得値を、欠損を0にせず共通ContentPerformanceへ正規化する。 */
export function normalizeNoteMetrics(
  article: NoteArticleDraft,
  payload: NoteMetricsPayload,
  now = new Date()
): ContentPerformance {
  const noteViews = metric(payload.views);
  const noteLikes = metric(payload.likes);
  const noteSales = metric(payload.sales);
  const noteRevenue = metric(payload.revenue);
  const noteFollowers = metric(payload.followers);
  const availability = (value?: number) => value === undefined ? "unavailable" as const : "available" as const;
  return {
    contentId: article.id,
    trendClusterId: article.sourceTrendClusterId,
    platform: "note",
    purpose: article.articleType === "paid" ? "paid-note" : "note-bridge",
    genreId: article.genreId ?? "unknown",
    articleType: article.articleType,
    publishedAt: article.updatedAt || article.createdAt,
    noteViews, noteLikes, noteSales, noteRevenue, paidPurchases: noteSales, noteFollowers,
    measuredAt: payload.measuredAt ?? now.toISOString(),
    metricsStale: false,
    metricAvailability: {
      noteViews: availability(noteViews), noteLikes: availability(noteLikes),
      noteSales: availability(noteSales), noteRevenue: availability(noteRevenue),
      noteFollowers: availability(noteFollowers),
    },
  };
}
