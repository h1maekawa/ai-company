import type { DailyGrowthReview } from "./growthLoop";

export type ContentDashboardGrowth = {
  status: "AVAILABLE" | "INSUFFICIENT_DATA" | "UNAVAILABLE";
  impressions7d: number | null;
  impressions30d: number | null;
  bestContent: { contentId: string; impressions: number | null } | null;
  evidenceCount: number | null;
  confidence: "LOW" | "MEDIUM" | "HIGH" | null;
  observations: string[];
  nextExperiment: string | null;
  measuredThrough: string | null;
};

const safeObservation = (value: string) => /^\d+件中\d+件が(?:数字始まり|Question Hook)$/.test(value);

/** Dashboardへは集計済みの構造だけを渡し、競合投稿の本文・URL・IDは渡さない。 */
export function buildContentDashboardGrowth(review?: DailyGrowthReview): ContentDashboardGrowth {
  if (!review) return { status:"UNAVAILABLE", impressions7d:null, impressions30d:null, bestContent:null, evidenceCount:null, confidence:null, observations:[], nextExperiment:null, measuredThrough:null };
  const evidenceCount = typeof review.evidenceCount === "number" ? review.evidenceCount : null;
  const confidence = typeof review.confidence === "string" && ["low", "medium", "high"].includes(review.confidence) ? review.confidence : null;
  const sufficient = evidenceCount !== null && evidenceCount >= 3 && confidence !== null && confidence !== "low";
  const comparisons = review.comparisons as DailyGrowthReview["comparisons"] | undefined;
  const experiments = Array.isArray(review.experiments) ? review.experiments : [];
  return {
    status: sufficient ? "AVAILABLE" : "INSUFFICIENT_DATA",
    impressions7d: comparisons?.last7Days?.impressions ?? null,
    impressions30d: comparisons?.last30Days?.impressions ?? null,
    bestContent: review.bestContent ? { contentId:review.bestContent.contentId, impressions:review.bestContent.impressions ?? null } : null,
    evidenceCount,
    confidence: confidence ? confidence.toUpperCase() as "LOW" | "MEDIUM" | "HIGH" : null,
    observations: sufficient ? (review.competitorDifferences ?? []).filter(safeObservation).slice(0, 3) : [],
    nextExperiment: sufficient ? (review.nextExperiment ?? experiments[0] ?? null) : null,
    measuredThrough: review.measuredThrough ?? null,
  };
}
