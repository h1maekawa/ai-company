import type { PlatformEvaluationGoal, PlatformMetricBaseline, PlatformMetricComparison, PlatformMetricKey } from "./types";

export function compareWithBaseline(actual: number | null | undefined, baseline: PlatformMetricBaseline): PlatformMetricComparison {
  if (baseline.status === "insufficient_data") return { actual: actual ?? null, baseline: null, delta: null, deltaRate: null, sampleSize: baseline.sampleSize, status: "insufficient_data" };
  if (baseline.status !== "available" || actual === null || actual === undefined || baseline.value === null) return { actual: actual ?? null, baseline: baseline.value, delta: null, deltaRate: null, sampleSize: baseline.sampleSize, status: "unavailable" };
  const delta = actual - baseline.value;
  return { actual, baseline: baseline.value, delta, deltaRate: baseline.value === 0 ? null : delta / baseline.value * 100, sampleSize: baseline.sampleSize, status: "available" };
}

export const PRIMARY_METRICS_BY_GOAL: Record<PlatformEvaluationGoal, PlatformMetricKey[]> = {
  reach: ["impressions", "views"],
  engagement: ["replies", "reposts", "saves", "shares"],
  trust: ["profileVisits", "followersGained"],
  traffic: ["profileVisits", "linkClicks"],
  conversion: ["conversions"],
  revenue: ["revenue", "revenuePer1000Impressions", "revenuePer1000Views"],
};

