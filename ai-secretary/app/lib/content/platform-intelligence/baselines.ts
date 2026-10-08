import type { PlatformMetricBaseline, PlatformMetricKey, PlatformPerformanceProjection, PlatformPerformanceRecord } from "./types";

const DAY = 86_400_000;

export function median(values: number[]): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[middle - 1] + sorted[middle]) / 2 : sorted[middle];
}

export function metricValue(record: PlatformPerformanceRecord, metric: PlatformMetricKey): number | null {
  if (metric === "revenuePer1000Impressions") {
    const revenue = record.metrics.revenue; const denominator = record.metrics.impressions;
    return revenue === null || denominator === null || denominator === 0 ? null : revenue / (denominator / 1000);
  }
  if (metric === "revenuePer1000Views") {
    const revenue = record.metrics.revenue; const denominator = record.metrics.views;
    return revenue === null || denominator === null || denominator === 0 ? null : revenue / (denominator / 1000);
  }
  return record.metrics[metric];
}

export function calculateBaseline(input: {
  projection: PlatformPerformanceProjection;
  metric: PlatformMetricKey;
  window: "7d" | "28d";
  now?: Date;
}): PlatformMetricBaseline {
  if (input.projection.freshness === "not_configured") return { platform: input.projection.platform, metric: input.metric, value: null, sampleSize: 0, window: input.window, status: "unavailable" };
  const now = input.now ?? new Date();
  const cutoff = now.getTime() - (input.window === "7d" ? 7 : 28) * DAY;
  const values = input.projection.records
    .filter((record) => record.freshness === "fresh" && new Date(record.publishedAt).getTime() >= cutoff)
    .map((record) => metricValue(record, input.metric))
    .filter((value): value is number => value !== null);
  return {
    platform: input.projection.platform,
    metric: input.metric,
    value: values.length >= 3 ? median(values) : null,
    sampleSize: values.length,
    window: input.window,
    status: values.length >= 3 ? "available" : "insufficient_data",
  };
}

