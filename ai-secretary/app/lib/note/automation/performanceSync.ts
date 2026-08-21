import { loadBrand, loadIdeas } from "@/app/lib/note/store";
import {
  evaluateWinningTopics,
  planWeeklyNoteCandidates,
  nextMetricsSnapshotHour,
  weekKeyTokyo,
} from "@/app/lib/note/operations";
import { fetchXMetrics, type XMetricsResult } from "@/app/lib/note/publishing/xMetrics";
import { getPost } from "@/app/lib/note/publishing/buffer";
import { generateNoteArticle } from "@/app/lib/note/research/generate";
import { usableExperiences } from "@/app/lib/note/research/experience";
import {
  loadClusters,
  loadExperiences,
  loadNoteQueue,
  loadPerformance,
  loadResearchInbox,
  loadResearchSettings,
  loadSocialDrafts,
  saveNoteQueue,
  savePerformance,
  saveSocialDrafts,
} from "@/app/lib/note/research/store";
import { DEFAULT_GENRES } from "@/app/lib/note/types";
import type { SocialDraft } from "@/app/lib/note/research/types";

export type PerformanceSyncResult = {
  checked: number;
  synced: number;
  failed: number;
  winningTopics: number;
  noteCandidates: number;
  noteDrafts: number;
  failures: { draftId: string; error: string }[];
};

type MetricsFetcher = (draft: SocialDraft, now?: Date) => Promise<XMetricsResult>;
type BufferChecker = typeof getPost;

export function shouldSyncDraft(draft: SocialDraft, now = new Date()): boolean {
  if (!draft.scheduledAt || !draft.bufferPostId) return false;
  const age = now.getTime() - new Date(draft.scheduledAt).getTime();
  if (age < 0) return false;
  return nextMetricsSnapshotHour(age / 3_600_000, draft.metricsSnapshotHours) !== null;
}

export async function syncXPerformance(
  drafts: SocialDraft[],
  records: Awaited<ReturnType<typeof loadPerformance>>["records"],
  fetcher: MetricsFetcher = fetchXMetrics,
  now = new Date(),
  bufferChecker: BufferChecker = getPost
) {
  const nextDrafts = [...drafts];
  const nextRecords = [...records];
  const failures: { draftId: string; error: string }[] = [];
  let synced = 0;
  const targets = drafts.filter((draft) => shouldSyncDraft(draft, now));
  for (const draft of targets) {
    // Buffer障害はX投稿・下書きを変更せず、そのまま再試行可能にする。
    const buffer = draft.bufferPostId ? await bufferChecker(draft.bufferPostId) : null;
    // Bufferの状態APIが落ちても、X Post ID解決とMetrics取得は独立して続行する。
    if (buffer && !buffer.ok) console.warn(`[performance-sync] Buffer確認失敗 (${draft.id}): ${buffer.error.message}`);
    const result = await fetcher(draft, now);
    const index = nextDrafts.findIndex((item) => item.id === draft.id);
    if (!result.ok) {
      failures.push({ draftId: draft.id, error: result.error });
      nextDrafts[index] = { ...nextDrafts[index], metricsSyncError: result.error };
      continue;
    }
    synced++;
    nextDrafts[index] = {
      ...nextDrafts[index],
      status: "published",
      xPostId: result.xPostId,
      metricsLastSyncedAt: now.toISOString(),
      metricsSnapshotHours: nextMetricsSnapshotHour(
        Math.max(0, (now.getTime() - new Date(draft.scheduledAt!).getTime()) / 3_600_000),
        draft.metricsSnapshotHours
      ) ?? draft.metricsSnapshotHours,
      metricsSyncError: undefined,
    };
    const recordIndex = nextRecords.findIndex((record) => record.platform === "x" && record.contentId === draft.id);
    if (recordIndex >= 0) nextRecords[recordIndex] = result.metrics;
    else nextRecords.unshift(result.metrics);
  }
  return { checked: targets.length, synced, failures, drafts: nextDrafts, records: nextRecords };
}

export async function runPerformanceSync(now = new Date()): Promise<PerformanceSyncResult> {
  const [drafts, performance, settings] = await Promise.all([
    loadSocialDrafts(), loadPerformance(), loadResearchSettings(),
  ]);
  const synced = await syncXPerformance(drafts, performance.records, fetchXMetrics, now);
  if (synced.checked > 0) await saveSocialDrafts(synced.drafts);
  if (synced.synced > 0) await savePerformance({ ...performance, records: synced.records });
  const topics = evaluateWinningTopics(synced.records, settings.performanceWeights, settings.winningTopicPolicy);
  const prepared = await prepareWeeklyNoteDrafts(topics, now);
  return {
    checked: synced.checked,
    synced: synced.synced,
    failed: synced.failures.length,
    winningTopics: topics.filter((topic) => topic.winning).length,
    noteCandidates: prepared.candidates,
    noteDrafts: prepared.created,
    failures: synced.failures,
  };
}

export async function prepareWeeklyNoteDrafts(
  topics: ReturnType<typeof evaluateWinningTopics>,
  now = new Date()
): Promise<{ candidates: number; created: number; failures: string[] }> {
  const [queue, clusters, items, experiences, brandFile, ideaFile, socialDrafts] = await Promise.all([
    loadNoteQueue(), loadClusters(), loadResearchInbox(), loadExperiences(), loadBrand(), loadIdeas(), loadSocialDrafts(),
  ]);
  const weekKey = weekKeyTokyo(now);
  const plan = planWeeklyNoteCandidates({ topics, existingArticles: queue.articles, weekKey });
  const articles = [...queue.articles];
  const failures: string[] = [];
  for (const candidate of plan) {
    const cluster = clusters.find((item) => item.id === candidate.topicId);
    if (!cluster || cluster.blocked) continue;
    const selected = usableExperiences(experiences, cluster.matchedExperienceIds);
    const genreId = cluster.genreIds[0] ?? DEFAULT_GENRES[0].id;
    const genre = ideaFile.genres.find((item) => item.id === genreId) ?? DEFAULT_GENRES.find((item) => item.id === genreId) ?? DEFAULT_GENRES[0];
    const result = await generateNoteArticle({
      cluster,
      items: items.filter((item) => cluster.researchItemIds.includes(item.id)),
      experiences: selected,
      brand: brandFile.brand,
      genre,
      articleType: candidate.articleType,
      pastPosts: [
        ...socialDrafts.map((draft) => ({ label: `X(${draft.id})`, text: draft.text })),
        ...articles.map((article) => ({ label: `note(${article.id})`, text: `${article.title}\n${article.freeSection}` })),
      ],
    });
    if (!result.article) {
      failures.push(`${candidate.candidateKey}: ${result.error ?? "生成失敗"}`);
      continue;
    }
    articles.unshift({
      ...result.article,
      sourceTrendClusterId: cluster.id,
      autoCandidateKey: candidate.candidateKey,
      autoCandidateWeek: weekKey,
      // 開始日未設定時も初回90日は安全側で100円候補を優先する。
      priceSuggestion: candidate.articleType === "paid" && isInitial90Days(now) ? "100円（初期90日の検証価格）" : result.article.priceSuggestion,
      status: "draft",
    });
  }
  if (articles.length !== queue.articles.length) await saveNoteQueue({ ...queue, articles });
  return { candidates: plan.length, created: articles.length - queue.articles.length, failures };
}

function isInitial90Days(now: Date): boolean {
  const configured = process.env.NOTE_OPERATIONS_STARTED_AT;
  if (!configured) return true;
  const start = new Date(configured).getTime();
  return Number.isFinite(start) && now.getTime() - start < 90 * 86_400_000;
}
