import { callAI } from "../../ai/client";
import { buildDailyGrowthReview } from "../growthLoop";
import { runPerformanceSync, type PerformanceSyncResult } from "./performanceSync";
import {
  loadGrowthReviews, loadNoteQueue, loadPerformance, loadResearchSettings,
  saveGrowthReviews, saveNoteQueue, saveResearchSettings,
} from "../research/store";
import type { PublishJob } from "../research/types";

export type NightlyGrowthResult = {
  reviewDate: string;
  performanceSync?: PerformanceSyncResult;
  performanceSyncError?: string;
  noteMetricsJobsQueued: number;
  strategyChanged: boolean;
  confidence: "low" | "medium" | "high";
};

async function generateExperiments(context: string): Promise<string[]> {
  try {
    const response = await callAI(context, `note / X事業部の明日の実験を最大3件、JSON {"experiments":["..."]} で返してください。各実験は1変数だけを変更し、Brand・Safety・事実・投稿数・価格・Human Approvalを変更しないでください。`, { provider: "auto" });
    const match = response.match(/\{[\s\S]*\}/);
    const parsed = match ? JSON.parse(match[0]) as { experiments?: unknown[] } : {};
    return (parsed.experiments ?? []).map(String).filter(Boolean).slice(0, 3);
  } catch (error) {
    console.warn("[nightly-growth] AI実験生成に失敗。決定論的レビューを継続:", error);
    return [];
  }
}

export async function runNightlyGrowthReview(now = new Date()): Promise<NightlyGrowthResult> {
  let performanceSync: PerformanceSyncResult | undefined;
  let performanceSyncError: string | undefined;
  try {
    performanceSync = await runPerformanceSync(now);
  } catch (error) {
    performanceSyncError = error instanceof Error ? error.message : "Performance Sync failed";
  }

  const [performance, settings, queue, existingReviews] = await Promise.all([
    loadPerformance(), loadResearchSettings(), loadNoteQueue(), loadGrowthReviews(),
  ]);
  const tokyoDate = new Date(now.getTime() + 9 * 3_600_000).toISOString().slice(0, 10);
  const pendingArticleIds = new Set(queue.jobs.filter((job) => job.kind === "note-metrics-sync" && (job.status === "pending" || job.status === "running")).map((job) => job.articleId));
  const existingJobIds = new Set(queue.jobs.map((job) => job.id));
  const metricJobs: PublishJob[] = queue.articles
    .filter((article) => article.status === "published" && article.noteUrl && !pendingArticleIds.has(article.id) && !existingJobIds.has(`nm-${tokyoDate}-${article.id}`))
    .map((article) => ({
      id: `nm-${tokyoDate}-${article.id}`,
      kind: "note-metrics-sync" as const, articleId: article.id, status: "pending" as const,
      createdAt: now.toISOString(),
    }));
  if (metricJobs.length) await saveNoteQueue({ ...queue, jobs: [...metricJobs, ...queue.jobs] });

  const noteRecords = performance.records.filter((record) => record.platform === "note");
  const latestNote = noteRecords.sort((a, b) => b.measuredAt.localeCompare(a.measuredAt))[0];
  const noteFreshness = !latestNote ? "unavailable" as const
    : now.getTime() - new Date(latestNote.measuredAt).getTime() > 36 * 3_600_000 ? "stale" as const : "fresh" as const;
  const priorities = queue.articles.filter((article) => article.status === "draft").slice(0, 3).map((article) => ({
    articleId: article.id, title: article.title,
    reason: `X Topic実績と${article.articleType} note候補を確認し、人が公開可否を判断`,
    priceSuggestion: article.priceSuggestion,
  }));
  const experiments = await generateExperiments(JSON.stringify({
    records: performance.records.slice(0, 30), strategy: settings.growthStrategy,
  }));
  const review = buildDailyGrowthReview({
    records: performance.records, strategy: settings.growthStrategy,
    weights: settings.performanceWeights, winningTopicPolicy: settings.winningTopicPolicy,
    now, noteFreshness, xFreshness: performanceSyncError ? "partial" : "fresh", experiments, noteApprovalPriorities: priorities,
  });
  // 日付単位でidempotent。過去日は保持し、同日のretryは最新計測で置換する。
  await saveGrowthReviews([review, ...existingReviews.filter((item) => item.date !== review.date)]);
  const strategyChanged = review.appliedChanges.length > 0;
  if (strategyChanged) {
    await saveResearchSettings({ ...settings, purposeMix: review.strategyAfter.purposeMix, growthStrategy: review.strategyAfter });
  }
  return { reviewDate: review.date, performanceSync, performanceSyncError, noteMetricsJobsQueued: metricJobs.length, strategyChanged, confidence: review.confidence };
}
