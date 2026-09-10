import { callAI } from "../../ai/client";
import { buildDailyGrowthReview } from "../growthLoop";
import { runPerformanceSync, type PerformanceSyncResult } from "./performanceSync";
import { runAutoApproval, type AutoApprovalResult } from "../../review/autoApprove";
import {
  loadGrowthReviews, loadNoteQueue, loadPerformance, loadResearchSettings,
  loadSocialDrafts, saveGrowthReviews, saveNoteQueue, saveResearchSettings,
} from "../research/store";
import type { PublishJob } from "../research/types";
import { captureKnowledgeCandidate } from "../../knowledge/captureService";
import { computeLearnedStyleProfile, loadStyleProfile, saveStyleProfile } from "../styleProfile";
import { loadXWorkspace } from "../x/store";
import { buildWeeklyCeoReport, loadWeeklyCeoReports, saveWeeklyCeoReport, weeklyCeoReportSlackText } from "./weeklyReport";
import { postToSlack } from "../../integrations/slack/blocks";
import { weekKeyTokyo } from "../operations";

export type NightlyGrowthResult = {
  reviewDate: string;
  performanceSync?: PerformanceSyncResult;
  performanceSyncError?: string;
  /** 自動承認（要件10）の結果 */
  autoApproval?: AutoApprovalResult;
  autoApprovalError?: string;
  noteMetricsJobsQueued: number;
  strategyChanged: boolean;
  styleProfileUpdated: boolean;
  weeklyReportGenerated: boolean;
  performanceDropEscalated: boolean;
  confidence: "low" | "medium" | "high";
};

/**
 * 1実験1変数を保証する（要件P0.4）。
 * variableが固定enumの1つだけの構造化JSONで返させ、コード側でそれ以外を機械的に捨てる
 * （複数変数のfreeform文字列や未知のvariableは採用しない＝フェイルクローズ）。
 */
const EXPERIMENT_VARIABLES = [
  "hook", "opening", "ending", "cta", "postingSlot", "topic",
  "tone", "sentenceLength", "lineBreak", "question",
] as const;
type ExperimentVariable = (typeof EXPERIMENT_VARIABLES)[number];

function isExperimentVariable(value: unknown): value is ExperimentVariable {
  return typeof value === "string" && (EXPERIMENT_VARIABLES as readonly string[]).includes(value);
}

async function generateExperiments(context: string): Promise<string[]> {
  try {
    const response = await callAI(
      context,
      `note / X事業部の明日の実験を最大3件、JSON {"experiments":[{"variable":"hook|opening|ending|cta|postingSlot|topic|tone|sentenceLength|lineBreak|question","change":"具体的な変更内容(40文字以内)"}]} で返してください。` +
        `各experimentは必ずvariableを1つだけ選び、その1変数だけの変更内容をchangeへ書いてください。Brand・Safety・事実・投稿数・価格・Human Approvalは変更しないでください。`,
      { provider: "auto" }
    );
    const match = response.match(/\{[\s\S]*\}/);
    const parsed = match
      ? (JSON.parse(match[0]) as { experiments?: { variable?: unknown; change?: unknown }[] })
      : {};
    // variableが有効なenumの1つ、かつchangeが非空文字列のものだけ採用する（複数変数・未知形式は捨てる）
    return (parsed.experiments ?? [])
      .filter((e) => isExperimentVariable(e.variable) && typeof e.change === "string" && e.change.trim())
      .map((e) => `[${e.variable}] ${String(e.change).trim()}`)
      .slice(0, 3);
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

  /*
   * 自動承認（要件10）。実績同期の後に置くことで、
   * その日の実績から生まれた学びも同じ夜のうちに判定対象へ入る。
   * 落ちても夜間レビュー自体は続ける。
   */
  let autoApproval: AutoApprovalResult | undefined;
  let autoApprovalError: string | undefined;
  try {
    autoApproval = await runAutoApproval();
  } catch (error) {
    autoApprovalError = error instanceof Error ? error.message : "Auto approval failed";
  }

  const [performance, settings, queue, existingReviews, socialDrafts, styleProfile, workspace] =
    await Promise.all([
      loadPerformance(), loadResearchSettings(), loadNoteQueue(), loadGrowthReviews(),
      loadSocialDrafts(), loadStyleProfile(),
      // 本人のX過去投稿（アーカイブ）。文体学習の「種」（TASK-N3 / 要件4）
      loadXWorkspace().catch(() => ({ ownedPosts: [], referenceNotes: [] })),
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

  // 要件19: 繰り返し勝ったPatternだけをKnowledgeへ蓄積する（全件は保存しない。失敗しても致命的にしない）
  if (review.winningPatterns.length > 0) {
    const digest = review.winningPatterns
      .slice(0, 5)
      .map((p, i) => `${i + 1}. ${p.purpose}/${p.pattern}（${p.postingSlot}・平均${p.averageScore}点・${p.sampleSize}投稿）`)
      .join("\n");
    await captureKnowledgeCandidate({
      content: `SNS事業部 Growth Review ${review.date}: 継続して勝っているPattern\n\n${digest}\n\nBottleneck: ${review.bottleneck}`,
      source: "research",
      title: `growth-pattern-${review.date}`,
    }).catch((error) => console.error("[nightly-growth] Knowledge Captureに失敗（非致命）:", error));
  }

  const strategyChanged = review.appliedChanges.length > 0;
  if (strategyChanged) {
    await saveResearchSettings({ ...settings, purposeMix: review.strategyAfter.purposeMix, growthStrategy: review.strategyAfter });
  }

  // 要件P0.1/P0.2: Performance → Style自己改善。source:manualのフィールドは上書きしない。
  // Brand自体（人格）はここでは一切変更しない（StyleProfileはBrand/Safetyより下位の参照情報）。
  const learnedStyleProfile = computeLearnedStyleProfile(
    styleProfile, socialDrafts, performance.records, settings.performanceWeights,
    workspace.ownedPosts
  );
  const styleProfileUpdated = JSON.stringify(learnedStyleProfile) !== JSON.stringify(styleProfile);
  if (styleProfileUpdated) await saveStyleProfile(learnedStyleProfile);

  // 要件P1.6: 異常なPerformance低下のみHuman Escalationする（通常の増減は通知しない）
  const { last7Days, previous7Days } = review.comparisons;
  let performanceDropEscalated = false;
  if (
    review.confidence !== "low" &&
    typeof last7Days.impressions === "number" &&
    typeof previous7Days.impressions === "number" &&
    previous7Days.impressions >= 500 &&
    last7Days.impressions < previous7Days.impressions * 0.6
  ) {
    performanceDropEscalated = true;
    await postToSlack(
      [
        "⚠️ SNS事業部 異常検知: Performance低下",
        `直近7日のImpressionsが前週比で大きく低下しています（前週 ${previous7Days.impressions} → 今週 ${last7Days.impressions}）。`,
        `Bottleneck: ${review.bottleneck}`,
      ].join("\n")
    ).catch((error) => console.error("[nightly-growth] 異常検知Slack通知に失敗:", error));
  }

  // 要件P1.5: 週1回だけWeekly CEO Reportを作る（Tokyo日曜のみ・週単位でidempotent）
  const tokyoWeekday = new Date(now.getTime() + 9 * 3_600_000).getUTCDay();
  const weekKey = weekKeyTokyo(now);
  let weeklyReportGenerated = false;
  if (tokyoWeekday === 0) {
    const existingWeeklyReports = await loadWeeklyCeoReports();
    if (!existingWeeklyReports.some((r) => r.weekKey === weekKey)) {
      const weeklyReport = buildWeeklyCeoReport({
        reviews: [review, ...existingReviews].slice(0, 7),
        performanceRecords: performance.records,
        weights: settings.performanceWeights,
        performanceSyncError,
        now,
      });
      await saveWeeklyCeoReport(weeklyReport);
      await postToSlack(weeklyCeoReportSlackText(weeklyReport)).catch((error) =>
        console.error("[nightly-growth] Weekly Report Slack通知に失敗:", error)
      );
      weeklyReportGenerated = true;
    }
  }

  return {
    reviewDate: review.date,
    performanceSync,
    performanceSyncError,
    autoApproval,
    autoApprovalError,
    noteMetricsJobsQueued: metricJobs.length,
    strategyChanged,
    styleProfileUpdated,
    weeklyReportGenerated,
    performanceDropEscalated,
    confidence: review.confidence,
  };
}
