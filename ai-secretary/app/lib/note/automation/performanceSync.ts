import { loadBrand, loadIdeas } from "@/app/lib/note/store";
import {
  evaluateWinningTopics,
  planWeeklyNoteCandidates,
  weekKeyTokyo,
} from "@/app/lib/note/operations";
import {
  bufferMetricsProvider,
  hasNewerBufferMetrics,
  isDailyMetricsCandidate,
  samePerformanceValues,
} from "@/app/lib/note/publishing/bufferMetrics";
import type { PerformanceProviderResult } from "@/app/lib/note/publishing/performanceProvider";
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
  unchanged: number;
  failed: number;
  winningTopics: number;
  noteCandidates: number;
  noteDrafts: number;
  failures: { draftId: string; error: string }[];
};

type MetricsFetcher = (draft: SocialDraft, now?: Date) => Promise<PerformanceProviderResult>;

export function shouldSyncDraft(draft: SocialDraft, now = new Date()): boolean {
  return isDailyMetricsCandidate(draft, now);
}

export async function syncPerformance(
  drafts: SocialDraft[],
  records: Awaited<ReturnType<typeof loadPerformance>>["records"],
  fetcher: MetricsFetcher = bufferMetricsProvider.fetch,
  now = new Date()
) {
  const nextDrafts = [...drafts];
  const nextRecords = [...records];
  const failures: { draftId: string; error: string }[] = [];
  let synced = 0;
  let unchanged = 0;
  let metadataUpdated = 0;
  const targets = drafts
    .filter((draft) => shouldSyncDraft(draft, now))
    .sort((a, b) => Number(Boolean(a.bufferMetricsUpdatedAt)) - Number(Boolean(b.bufferMetricsUpdatedAt)));
  for (const draft of targets) {
    const result = await fetcher(draft, now);
    const index = nextDrafts.findIndex((item) => item.id === draft.id);
    if (!result.ok) {
      failures.push({ draftId: draft.id, error: result.error });
      nextDrafts[index] = { ...nextDrafts[index], metricsSyncError: result.error };
      continue;
    }
    const existingRecord = nextRecords.find(
      (record) => record.platform === "x" && record.contentId === draft.id
    );
    if (!hasNewerBufferMetrics(draft, result.providerUpdatedAt, Boolean(existingRecord))) {
      unchanged++;
      continue;
    }
    nextDrafts[index] = {
      ...nextDrafts[index],
      status: "published",
      bufferMetricsUpdatedAt: result.providerUpdatedAt,
      bufferExternalLink: result.externalLink ?? nextDrafts[index].bufferExternalLink,
      metricsLastSyncedAt: now.toISOString(),
      metricsSyncError: undefined,
    };
    metadataUpdated++;
    if (existingRecord && samePerformanceValues(existingRecord, result.metrics)) {
      unchanged++;
      continue;
    }
    synced++;
    const recordIndex = nextRecords.findIndex((record) => record.platform === "x" && record.contentId === draft.id);
    if (recordIndex >= 0) nextRecords[recordIndex] = result.metrics;
    else nextRecords.unshift(result.metrics);
  }
  return { checked: targets.length, synced, unchanged, metadataUpdated, failures, drafts: nextDrafts, records: nextRecords };
}

export async function runPerformanceSync(now = new Date()): Promise<PerformanceSyncResult> {
  const [drafts, performance, settings] = await Promise.all([
    loadSocialDrafts(), loadPerformance(), loadResearchSettings(),
  ]);
  const synced = await syncPerformance(drafts, performance.records, bufferMetricsProvider.fetch, now);
  if (synced.metadataUpdated > 0 || synced.failures.length > 0) await saveSocialDrafts(synced.drafts);
  if (synced.synced > 0) await savePerformance({ ...performance, records: synced.records });
  const topics = evaluateWinningTopics(synced.records, settings.performanceWeights, settings.winningTopicPolicy);
  const prepared = await prepareWeeklyNoteDrafts(topics, now);
  return {
    checked: synced.checked,
    synced: synced.synced,
    unchanged: synced.unchanged,
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
