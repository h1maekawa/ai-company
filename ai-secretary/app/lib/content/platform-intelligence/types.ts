import type { ContentPlatform } from "../brandProfile";
import type { ContentGoal } from "../../note/research/types";

export type PlatformMetricKey =
  | "impressions" | "views" | "likes" | "comments" | "replies" | "reposts"
  | "saves" | "shares" | "profileVisits" | "followersGained" | "linkClicks"
  | "conversions" | "revenue" | "revenuePer1000Impressions" | "revenuePer1000Views";

export type PlatformMetricValues = Record<Exclude<PlatformMetricKey, "revenuePer1000Impressions" | "revenuePer1000Views">, number | null>;

export type PlatformPerformanceRecord = {
  platform: ContentPlatform;
  contentId: string;
  publishedContentId?: string;
  contentGoal?: ContentGoal;
  publishedAt: string;
  observedAt: string | null;
  freshness: "fresh" | "stale" | "unavailable" | "not_configured";
  metrics: PlatformMetricValues;
  source: { kind: "content-performance" | "performance-snapshot" | "revenue-ledger"; sourceId?: string };
};

export type PlatformPerformanceProjection = {
  platform: ContentPlatform;
  records: PlatformPerformanceRecord[];
  freshness: PlatformPerformanceRecord["freshness"];
};

export type PlatformMetricBaseline = {
  platform: ContentPlatform;
  metric: PlatformMetricKey;
  value: number | null;
  sampleSize: number;
  window: "7d" | "28d";
  status: "available" | "insufficient_data" | "unavailable";
};

export type PlatformMetricComparison = {
  actual: number | null;
  baseline: number | null;
  delta: number | null;
  deltaRate: number | null;
  sampleSize: number;
  status: "available" | "insufficient_data" | "unavailable";
};

export type PlatformMetricTarget = {
  metric: PlatformMetricKey;
  value: number;
  source: "human" | "approved_strategy";
};

export type PlatformEvaluationGoal = "reach" | "engagement" | "trust" | "traffic" | "conversion" | "revenue";

export type PlatformExperiment = {
  id: string;
  platform: ContentPlatform;
  hypothesis: string;
  variableKey: string;
  controlValue?: string;
  experimentValue: string;
  primaryMetric: PlatformMetricKey;
  sourceLearningIds: string[];
  status: "candidate" | "approved" | "running" | "completed" | "rejected";
  createdAt: string;
};

