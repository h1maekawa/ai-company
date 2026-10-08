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
  normalizeBufferMetrics,
  samePerformanceValues,
} from "@/app/lib/note/publishing/bufferMetrics";
import type { PerformanceProviderResult } from "@/app/lib/note/publishing/performanceProvider";
import {
  getPostMetrics,
  getPostPublicationEvidence,
  type BufferPostMetrics,
  type BufferPostPublicationEvidence,
  type BufferResult,
} from "@/app/lib/note/publishing/buffer";
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
import { parseXPostUrl } from "@/app/lib/note/x/urls";
import {
  canaryCandidateReason,
  confirmCanaryPublication,
  duplicateCanaryLineageIds,
} from "@/app/lib/note/publishing/canaryReconciliation";

export type PerformanceSyncResult = {
  checked: number;
  synced: number;
  unchanged: number;
  failed: number;
  publicationConfirmed: number;
  metricsAvailable: number;
  metricsUnavailable: number;
  winningTopics: number;
  noteCandidates: number;
  noteDrafts: number;
  failures: PerformanceSyncDiagnostic[];
  diagnostics: PerformanceSyncDiagnostic[];
};

type MetricsFetcher = (draft: SocialDraft, now?: Date) => Promise<PerformanceProviderResult>;
type PublicationEvidenceFetcher = (
  postId: string
) => Promise<BufferResult<BufferPostPublicationEvidence | null>>;
type PostMetricsFetcher = (postId: string) => Promise<BufferResult<BufferPostMetrics | null>>;

export type PerformanceSyncReason =
  | "CANDIDATE_MISSING_BUFFER_POST_ID"
  | "CANDIDATE_MISSING_SCHEDULED_AT"
  | "CANDIDATE_MISSING_PLAN_ID"
  | "CANDIDATE_MISSING_PLAN_SLOT_ID"
  | "AMBIGUOUS_DUPLICATE_LINEAGE"
  | "BUFFER_QUERY_AMBIGUOUS"
  | "BUFFER_POST_NOT_FOUND"
  | "BUFFER_POST_NOT_SENT"
  | "BUFFER_SENT_AT_MISSING"
  | "BUFFER_EXTERNAL_LINK_MISSING"
  | "INVALID_X_EXTERNAL_LINK"
  | "METRICS_UNAVAILABLE"
  | "METRICS_PROVIDER_ERROR";

export type PerformanceSyncDiagnostic = {
  draftId: string;
  stage: "candidate-validation" | "publication-evidence" | "metrics";
  reason: PerformanceSyncReason;
};

type SyncDependencies = {
  publicationEvidenceFetcher?: PublicationEvidenceFetcher;
  postMetricsFetcher?: PostMetricsFetcher;
};

function isCanaryDraft(draft: SocialDraft): boolean {
  return draft.id.startsWith("x-canary-");
}

function unavailableCanaryRecord(
  draft: SocialDraft,
  evidence: BufferPostPublicationEvidence,
  now: Date
) {
  return normalizeBufferMetrics(
    draft,
    { ...evidence, metrics: null, metricsUpdatedAt: null },
    now,
    true
  );
}

function publicationQueryReason(result: BufferResult<unknown>): PerformanceSyncReason {
  if (result.ok) return "BUFFER_POST_NOT_FOUND";
  return "BUFFER_QUERY_AMBIGUOUS";
}

export function shouldSyncDraft(draft: SocialDraft, now = new Date()): boolean {
  return isDailyMetricsCandidate(draft, now);
}

export async function syncPerformance(
  drafts: SocialDraft[],
  records: Awaited<ReturnType<typeof loadPerformance>>["records"],
  fetcher: MetricsFetcher = bufferMetricsProvider.fetch,
  now = new Date(),
  dependencies: SyncDependencies = {}
) {
  const publicationEvidenceFetcher = dependencies.publicationEvidenceFetcher ?? getPostPublicationEvidence;
  const postMetricsFetcher = dependencies.postMetricsFetcher ?? getPostMetrics;
  const nextDrafts = [...drafts];
  const nextRecords = [...records];
  const failures: PerformanceSyncDiagnostic[] = [];
  const diagnostics: PerformanceSyncDiagnostic[] = [];
  let synced = 0;
  let unchanged = 0;
  let metadataUpdated = 0;
  let publicationConfirmed = 0;
  let metricsAvailable = 0;
  let metricsUnavailable = 0;

  const invalidCanaryIds = duplicateCanaryLineageIds(drafts);
  for (const draft of drafts.filter(isCanaryDraft)) {
    const missing = canaryCandidateReason(draft);
    if (missing) {
      failures.push({ draftId: draft.id, stage: "candidate-validation", reason: missing });
      invalidCanaryIds.add(draft.id);
    } else if (invalidCanaryIds.has(draft.id)) {
      failures.push({
        draftId: draft.id,
        stage: "candidate-validation",
        reason: "AMBIGUOUS_DUPLICATE_LINEAGE",
      });
    }
  }

  const targets = drafts
    .filter((draft) => shouldSyncDraft(draft, now) && !invalidCanaryIds.has(draft.id))
    .sort((a, b) => Number(Boolean(a.bufferMetricsUpdatedAt)) - Number(Boolean(b.bufferMetricsUpdatedAt)));
  for (const draft of targets) {
    if (isCanaryDraft(draft)) {
      // Required fields were validated above; keep runtime checks fail-closed.
      if (!draft.bufferPostId || !draft.scheduledAt || !draft.planId || !draft.planSlotId) continue;
      const publication = await publicationEvidenceFetcher(draft.bufferPostId);
      if (!publication.ok || !publication.data) {
        failures.push({
          draftId: draft.id,
          stage: "publication-evidence",
          reason: publicationQueryReason(publication),
        });
        continue;
      }
      const evidence = publication.data;
      const confirmed = confirmCanaryPublication(draft, evidence);
      if (!confirmed.ok) {
        failures.push({ draftId: draft.id, stage: "publication-evidence", reason: confirmed.reason });
        continue;
      }

      const index = nextDrafts.findIndex((item) => item.id === draft.id);
      nextDrafts[index] = {
        ...confirmed.draft,
        metricsLastSyncedAt: now.toISOString(),
      };
      metadataUpdated++;
      publicationConfirmed++;

      const metricsResult = await postMetricsFetcher(draft.bufferPostId);
      const metricsPost = metricsResult.ok ? metricsResult.data : null;
      const metricsRecord = metricsPost?.metricsUpdatedAt && Array.isArray(metricsPost.metrics)
        ? normalizeBufferMetrics(
            nextDrafts[index],
            { ...evidence, ...metricsPost },
            now
          )
        : null;
      const existingRecord = nextRecords.find(
        (record) => record.platform === "x" && record.contentId === draft.id
      );
      const record = metricsRecord ?? unavailableCanaryRecord(nextDrafts[index], evidence, now);
      if (!record) {
        failures.push({ draftId: draft.id, stage: "metrics", reason: "METRICS_PROVIDER_ERROR" });
        continue;
      }

      if (metricsRecord) {
        metricsAvailable++;
        nextDrafts[index] = {
          ...nextDrafts[index],
          bufferMetricsUpdatedAt: metricsPost?.metricsUpdatedAt ?? evidence.sentAt,
        };
      } else {
        metricsUnavailable++;
        diagnostics.push({ draftId: draft.id, stage: "metrics", reason: "METRICS_UNAVAILABLE" });
      }
      if (existingRecord && samePerformanceValues(existingRecord, record)) {
        unchanged++;
      } else {
        synced++;
        const recordIndex = nextRecords.findIndex(
          (item) => item.platform === "x" && item.contentId === draft.id
        );
        if (recordIndex >= 0) nextRecords[recordIndex] = record;
        else nextRecords.unshift(record);
      }
      continue;
    }

    const result = await fetcher(draft, now);
    const index = nextDrafts.findIndex((item) => item.id === draft.id);
    if (!result.ok) {
      failures.push({ draftId: draft.id, stage: "metrics", reason: "METRICS_PROVIDER_ERROR" });
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
      xPostId: result.externalLink ? (parseXPostUrl(result.externalLink)?.postId ?? nextDrafts[index].xPostId) : nextDrafts[index].xPostId,
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
  return {
    checked: targets.length,
    synced,
    unchanged,
    metadataUpdated,
    publicationConfirmed,
    metricsAvailable,
    metricsUnavailable,
    failures,
    diagnostics,
    drafts: nextDrafts,
    records: nextRecords,
  };
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
    publicationConfirmed: synced.publicationConfirmed,
    metricsAvailable: synced.metricsAvailable,
    metricsUnavailable: synced.metricsUnavailable,
    winningTopics: topics.filter((topic) => topic.winning).length,
    noteCandidates: prepared.candidates,
    noteDrafts: prepared.created,
    failures: synced.failures,
    diagnostics: synced.diagnostics,
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
