/**
 * 派生指標・Funnel・Attributionの純粋関数群。
 * 外部I/Oを持たない（Vault/AI呼び出しなし）ため、決定的にテストできる。
 *
 * 原則: データが揃っている場合のみ計算する。ゼロ除算・欠損値は必ずundefinedを返す
 * （0や推測値で埋めない）。
 */

import type { Attribution, Conversion, PerformanceSnapshot, PublishedContent, RevenueEvent } from "./types";

/** 分母が0または欠損なら計算しない */
export function safeDivide(numerator: number | null | undefined, denominator: number | null | undefined): number | undefined {
  if (numerator === null || numerator === undefined) return undefined;
  if (denominator === null || denominator === undefined || denominator === 0) return undefined;
  return numerator / denominator;
}

export function safeRate(numerator: number | null | undefined, denominator: number | null | undefined): number | undefined {
  const rate = safeDivide(numerator, denominator);
  return rate === undefined ? undefined : rate * 100;
}

export type DerivedMetrics = {
  ctr?: number;
  ctaCtr?: number;
  conversionRate?: number;
  revenuePerContent?: number;
  revenuePer1000Impressions?: number;
  averageRevenuePerConversion?: number;
};

/**
 * 1つのPublishedContentの最新スナップショット＋累計Revenueから派生指標を計算する。
 * 揃っていない項目は結果に含めない（undefined）。
 */
export function deriveMetrics(input: {
  impressions?: number | null;
  linkClicks?: number | null;
  ctaClicks?: number | null;
  conversions?: number | null;
  totalRevenue?: number;
  contentCount?: number;
}): DerivedMetrics {
  const impressions = input.impressions ?? undefined;
  const linkClicks = input.linkClicks ?? undefined;
  const ctaClicks = input.ctaClicks ?? undefined;
  const conversions = input.conversions ?? undefined;

  return {
    ctr: safeRate(linkClicks, impressions),
    ctaCtr: safeRate(ctaClicks, linkClicks),
    conversionRate: safeRate(conversions, ctaClicks ?? linkClicks),
    revenuePerContent: safeDivide(input.totalRevenue, input.contentCount),
    revenuePer1000Impressions:
      impressions === undefined || input.totalRevenue === undefined
        ? undefined
        : safeDivide(input.totalRevenue, impressions / 1000),
    averageRevenuePerConversion: safeDivide(input.totalRevenue, conversions),
  };
}

/* ─── Revenue集計（二重計上防止） ───────────────────────── */

/**
 * publishedContentIdごとにRevenueEventを合計する。
 * 1件のRevenueEventは必ず1つのpublishedContentIdにのみ属するため（型レベルの制約）、
 * 同じイベントを複数Contentへ計上することは構造的に起きない。ここではその集約を検証可能な形にする。
 */
export function revenueByContent(events: RevenueEvent[]): Map<string, number> {
  const totals = new Map<string, number>();
  for (const event of events) {
    totals.set(event.publishedContentId, (totals.get(event.publishedContentId) ?? 0) + event.amount);
  }
  return totals;
}

export function revenueByOffer(events: RevenueEvent[]): Map<string, number> {
  const totals = new Map<string, number>();
  for (const event of events) {
    if (!event.offerId) continue;
    totals.set(event.offerId, (totals.get(event.offerId) ?? 0) + event.amount);
  }
  return totals;
}

export function revenueByType(events: RevenueEvent[]): Map<string, number> {
  const totals = new Map<string, number>();
  for (const event of events) {
    totals.set(event.type, (totals.get(event.type) ?? 0) + event.amount);
  }
  return totals;
}

export function totalRevenue(events: RevenueEvent[]): number {
  return events.reduce((sum, e) => sum + e.amount, 0);
}

/** 期間フィルタ（今日/今週/今月/累計） */
export function filterByPeriod<T extends { occurredAt: string }>(
  items: T[],
  period: "today" | "week" | "month" | "all",
  now: Date = new Date()
): T[] {
  if (period === "all") return items;
  const cutoff = new Date(now);
  if (period === "today") cutoff.setHours(0, 0, 0, 0);
  if (period === "week") cutoff.setDate(cutoff.getDate() - 7);
  if (period === "month") cutoff.setMonth(cutoff.getMonth() - 1);
  return items.filter((i) => new Date(i.occurredAt).getTime() >= cutoff.getTime());
}

/* ─── Attribution ─────────────────────────────────────── */

/**
 * RevenueEventからAttributionを導出する。ctaId/offerIdが分かればdirect、
 * publishedContentIdだけならassisted、判定不能ならunknown。
 * 1 RevenueEvent = 1 Attribution（構造的に二重計上不可）。
 */
export function buildAttributions(events: RevenueEvent[]): Attribution[] {
  return events.map((event) => ({
    publishedContentId: event.publishedContentId,
    ctaId: event.ctaId,
    offerId: event.offerId,
    revenueEventId: event.id,
    attributionType: event.ctaId || event.offerId ? "direct" : event.publishedContentId ? "assisted" : "unknown",
  }));
}

/* ─── Funnel ───────────────────────────────────────────── */

export type FunnelStep = { label: string; value: number | null; rateFromPrevious?: number };

/**
 * X impressions → link clicks → note views → CTA clicks → purchases → revenue の
 * ファネルを組み立てる。算出不能な段はnullのまま返す（0にしない）。
 */
export function buildFunnel(input: {
  impressions?: number | null;
  linkClicks?: number | null;
  noteViews?: number | null;
  ctaClicks?: number | null;
  purchases?: number | null;
  revenue?: number | null;
}): FunnelStep[] {
  const steps: { label: string; value: number | null | undefined }[] = [
    { label: "impressions", value: input.impressions },
    { label: "linkClicks", value: input.linkClicks },
    { label: "noteViews", value: input.noteViews },
    { label: "ctaClicks", value: input.ctaClicks },
    { label: "purchases", value: input.purchases },
    { label: "revenue", value: input.revenue },
  ];
  return steps.map((step, index) => {
    const value = step.value === undefined ? null : step.value;
    if (index === 0 || value === null) return { label: step.label, value };
    const prev = steps[index - 1].value;
    const rateFromPrevious = prev === null || prev === undefined ? undefined : safeRate(value, prev);
    return { label: step.label, value, rateFromPrevious };
  });
}

/* ─── Snapshot集約 ────────────────────────────────────── */

/** PublishedContentごとの最新スナップショットを返す（capturedAtが最新のもの） */
export function latestSnapshotByContent(snapshots: PerformanceSnapshot[]): Map<string, PerformanceSnapshot> {
  const latest = new Map<string, PerformanceSnapshot>();
  for (const snap of snapshots) {
    const current = latest.get(snap.publishedContentId);
    if (!current || new Date(snap.capturedAt).getTime() > new Date(current.capturedAt).getTime()) {
      latest.set(snap.publishedContentId, snap);
    }
  }
  return latest;
}

export function conversionsByContent(conversions: Conversion[]): Map<string, Conversion[]> {
  const map = new Map<string, Conversion[]>();
  for (const c of conversions) {
    const list = map.get(c.publishedContentId) ?? [];
    list.push(c);
    map.set(c.publishedContentId, list);
  }
  return map;
}

/** 「今週投稿したもの」等のWeekly Review用集計。データ不足はneedsMoreDataで示す */
export function weeklyReviewSummary(
  published: PublishedContent[],
  snapshots: PerformanceSnapshot[],
  revenueEvents: RevenueEvent[],
  now: Date = new Date()
) {
  const weekPublished = filterByPeriod(
    published.map((p) => ({ ...p, occurredAt: p.publishedAt })),
    "week",
    now
  );
  const weekRevenue = filterByPeriod(revenueEvents, "week", now);
  const revenue = totalRevenue(weekRevenue);
  return {
    publishedCount: weekPublished.length,
    revenue,
    conversionCount: weekRevenue.length,
    needsMoreData: weekPublished.length === 0 && weekRevenue.length === 0 && snapshots.length === 0,
  };
}
