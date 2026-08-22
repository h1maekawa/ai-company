import { NextRequest, NextResponse } from "next/server";
import { buildFunnel, diagnoseFunnel, evaluateWinningTopics } from "@/app/lib/note/operations";
import {
  loadClusters,
  loadPerformance,
  loadNoteQueue,
  loadResearchSettings,
  loadSocialDrafts,
  loadGrowthReviews,
  savePerformance,
} from "@/app/lib/note/research/store";
import type { ContentPerformance } from "@/app/lib/note/research/types";

export const dynamic = "force-dynamic";

function last90Days(records: ContentPerformance[]): ContentPerformance[] {
  const since = Date.now() - 90 * 86_400_000;
  return records.filter((record) => new Date(record.publishedAt).getTime() >= since);
}

export async function GET(): Promise<NextResponse> {
  try {
    const [performance, settings, clusters, queue, socialDrafts, growthReviews] = await Promise.all([
      loadPerformance(),
      loadResearchSettings(),
      loadClusters(),
      loadNoteQueue(),
      loadSocialDrafts(),
      loadGrowthReviews(),
    ]);
    const records = last90Days(performance.records);
    const funnel = buildFunnel(records);
    const topics = evaluateWinningTopics(
      records,
      settings.performanceWeights,
      settings.winningTopicPolicy
    ).map((topic) => ({
      ...topic,
      title: clusters.find((cluster) => cluster.id === topic.topicId)?.title ?? topic.genreId,
    }));
    const noteCandidates = topics.filter(
      (topic) => topic.winning && (topic.nextStage === "free-note" || topic.nextStage === "paid-note")
    );
    const noteDrafts = queue.articles.filter((article) => article.status === "draft");
    return NextResponse.json({
      periodDays: 90,
      revenueGoal: 100_000,
      funnel,
      diagnosis: diagnoseFunnel(funnel),
      topics,
      summary: {
        postCount: socialDrafts.filter(
          (draft) => draft.status === "published" || Boolean(draft.xPostId) || Boolean(draft.bufferMetricsUpdatedAt)
        ).length,
        metricsSyncedPostCount: records.filter(
          (record) => record.platform === "x" && Object.values(record.metricAvailability ?? {}).includes("available")
        ).length,
        winningTopicCount: topics.filter((topic) => topic.winning).length,
        noteCandidateCount: noteCandidates.length,
        noteDraftCount: noteDrafts.length,
        freeNoteCandidateCount: queue.articles.filter(
          (article) => article.autoCandidateKey && article.articleType === "free"
        ).length,
        paidNoteCandidateCount: queue.articles.filter(
          (article) => article.autoCandidateKey && article.articleType === "paid"
        ).length,
        revenueProgressPct: Math.min(100, Math.round((funnel.revenue / 100_000) * 1000) / 10),
      },
      performanceWeights: settings.performanceWeights,
      winningTopicPolicy: settings.winningTopicPolicy,
      dailyReview: growthReviews[0],
      reviewHistory: growthReviews.slice(0, 28),
    });
  } catch (error) {
    console.error("[api/note/growth] GET失敗:", error);
    return NextResponse.json({ error: "Growth Insightsの取得に失敗しました" }, { status: 500 });
  }
}

/** X API / note集計 / 手動入力から同じ形式で実績を取り込む。 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const body = (await req.json()) as { record?: ContentPerformance };
    const record = body.record;
    if (!record?.contentId || !record.platform || !record.genreId || !record.publishedAt) {
      return NextResponse.json({ error: "実績レコードの必須項目が不足しています" }, { status: 400 });
    }
    const current = await loadPerformance();
    const key = `${record.platform}:${record.contentId}`;
    const records = [
      { ...record, measuredAt: record.measuredAt || new Date().toISOString() },
      ...current.records.filter((item) => `${item.platform}:${item.contentId}` !== key),
    ];
    await savePerformance({ ...current, records });
    return NextResponse.json({ ok: true, record: records[0] });
  } catch (error) {
    console.error("[api/note/growth] POST失敗:", error);
    return NextResponse.json({ error: "投稿実績の保存に失敗しました" }, { status: 500 });
  }
}
