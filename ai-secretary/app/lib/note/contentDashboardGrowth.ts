import type { DailyGrowthReview } from "./growthLoop";

export type ContentDashboardGrowth = {
  status: "AVAILABLE" | "INSUFFICIENT_DATA" | "UNAVAILABLE";
  impressions7d: number | null;
  impressions30d: number | null;
  bestContent: { contentId: string; impressions: number | null } | null;
  evidenceCount: number;
  confidence: "LOW" | "MEDIUM" | "HIGH" | null;
  observations: string[];
  nextExperiment: string | null;
  measuredThrough: string | null;
};

const safeObservation = (value: string) => /^\d+件中\d+件が(?:数字始まり|Question Hook)$/.test(value);

/** Dashboardへは集計済みの構造だけを渡し、競合投稿の本文・URL・IDは渡さない。 */
export function buildContentDashboardGrowth(review?: DailyGrowthReview): ContentDashboardGrowth {
  if (!review) return { status:"UNAVAILABLE", impressions7d:null, impressions30d:null, bestContent:null, evidenceCount:0, confidence:null, observations:[], nextExperiment:null, measuredThrough:null };
  const evidenceCount = review.evidenceCount ?? 0;
  const sufficient = evidenceCount >= 3 && review.confidence !== "low";
  return {
    status: sufficient ? "AVAILABLE" : "INSUFFICIENT_DATA",
    impressions7d: review.comparisons.last7Days.impressions ?? null,
    impressions30d: review.comparisons.last30Days.impressions ?? null,
    bestContent: review.bestContent ? { contentId:review.bestContent.contentId, impressions:review.bestContent.impressions ?? null } : null,
    evidenceCount,
    confidence: review.confidence.toUpperCase() as "LOW" | "MEDIUM" | "HIGH",
    observations: sufficient ? (review.competitorDifferences ?? []).filter(safeObservation).slice(0, 3) : [],
    nextExperiment: sufficient ? (review.nextExperiment ?? review.experiments[0] ?? null) : null,
    measuredThrough: review.measuredThrough ?? null,
  };
}
