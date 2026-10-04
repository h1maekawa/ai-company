import type { MorningBriefInsight } from "./types";

type Metrics = { postCount: number; impressions?: number };
type GrowthReview = {
  date: string; measuredThrough: string; confidence: "low" | "medium" | "high";
  xSummary: Metrics; comparisons: { last7Days: Metrics; previous7Days: Metrics; last30Days: Metrics };
  winningPatterns: Array<{ purpose: string; pattern: string; sampleSize: number }>;
  bestContent?: { contentId: string; impressions?: number };
  competitorDifferences?: string[]; nextExperiment?: string; experiments: string[]; evidenceCount?: number;
};

const tokyoDay = (date: Date) => new Date(date.getTime() + 9 * 3_600_000).toISOString().slice(0, 10);
const previousTokyoDay = (date: Date) => tokyoDay(new Date(date.getTime() - 86_400_000));
const metric = (value: number | undefined) => value === undefined ? "未取得" : value.toLocaleString("ja-JP");
const comparison = (current?: number, previous?: number) => {
  if (current === undefined || previous === undefined || previous <= 0) return "比較データ不足";
  const change = Math.round((current - previous) / previous * 100);
  return `Impressions ${change >= 0 ? "+" : ""}${change}%`;
};
const abstractCompetitorObservation = (value: string | undefined) => value && /^\d+件中\d+件が(?:数字始まり|Question Hook)$/.test(value) ? value : null;

export function buildXGrowthInsight(review: GrowthReview | undefined, now = new Date()): MorningBriefInsight | null {
  if (!review || !Number.isFinite(Date.parse(review.measuredThrough)) || Date.parse(review.measuredThrough) > now.getTime()) return null;
  if (![tokyoDay(now), previousTokyoDay(now)].includes(review.date)) return null;
  const evidenceCount = review.evidenceCount ?? 0;
  const sufficient = evidenceCount >= 3 && review.confidence !== "low";
  const lines = [
    `昨日: ${review.xSummary.postCount}投稿 / Impressions ${metric(review.xSummary.impressions)}`,
    `直近7日: ${comparison(review.comparisons.last7Days.impressions, review.comparisons.previous7Days.impressions)}`,
    `30日: ${review.comparisons.last30Days.postCount}投稿 / Impressions ${metric(review.comparisons.last30Days.impressions)}`,
    review.bestContent ? `Best Content: ${review.bestContent.contentId} / Impressions ${metric(review.bestContent.impressions)}` : "Best Content: 未取得",
    `Comparable samples: ${evidenceCount}`,
  ];
  if (!sufficient) {
    lines.push("Status: INSUFFICIENT_DATA", "比較データが不足しているため傾向を断定しません。", "次回: データ収集継続");
  } else {
    const pattern = review.winningPatterns.find((item) => item.sampleSize >= 3);
    if (pattern) lines.push(`Winning Pattern: ${pattern.purpose} / ${pattern.pattern}（${pattern.sampleSize}投稿で共通）`);
    const comparable = abstractCompetitorObservation(review.competitorDifferences?.[0]);
    if (comparable) lines.push(`Comparable Insight: ${comparable}`);
    const experiment = review.nextExperiment ?? review.experiments[0];
    if (experiment) lines.push(`Next Experiment: ${experiment}`);
  }
  lines.push(`Confidence: ${review.confidence.toUpperCase()}`);
  return { id: `x-growth:${review.date}`, area: "CONTENT", title: "📣 X Growth", summary: lines.join("\n"), deepLink: "/note?view=results", freshness: sufficient ? "fresh" : "insufficient", confidence: review.confidence };
}
