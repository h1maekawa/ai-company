import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";

const { buildXObservabilityProjection } = await import(path.join(process.env.MAEMICHI_DIST, "company/observability/xProjection.js"));

const now = new Date("2026-10-11T03:00:00.000Z");
const cluster = (overrides = {}) => ({ id: "cluster-1", title: "AI workflow", summary: "", genreIds: ["ai"], researchItemIds: ["r1", "r2"], sourceCount: 2, firstDetectedAt: "2026-10-10T00:00:00.000Z", lastDetectedAt: "2026-10-11T00:00:00.000Z", trendScore: 10, brandFitScore: 10, experienceFitScore: 10, monetizationFitScore: 10, originalityScore: 10, totalScore: 50, hotScore: 50, hotConfidence: "HIGH", hotScoreBreakdown: { momentum: 5, freshness: 5, crossSourceEvidence: 5, brandFit: 5, ownPerformanceFit: null, originality: 5, repetitionPenalty: 0, availableWeight: 70, measuredPostCount: 0 }, penalties: [], blocked: false, matchedExperienceIds: [], status: "candidate", ...overrides });
const slot = (overrides = {}) => ({ id: "daily-x:2026-10-11:primary:0", slotIndex: 0, purpose: "reach", operationRole: "reach", bucket: "reach", scheduledTime: "07:30", scheduledAt: "2026-10-10T22:30:00.000Z", timeSource: "default", exploration: false, candidateRef: { kind: "cluster", id: "cluster-1" }, status: "scheduled", draftId: "draft-1", bufferPostId: "buffer-1", updatedAt: "2026-10-10T22:20:00.000Z", ...overrides });
const plan = (slots = [slot()], overrides = {}) => ({ id: "daily-x:2026-10-11:primary", date: "2026-10-11", accountKey: "primary", strategySnapshot: { purposeMix: { reach: 70, noteBridge: 20, monetize: 10 }, explorationRate: 20, topicPriority: [], genrePriority: [], patternPriority: [], maxXPostsPerDay: 3 }, slots, generatedAt: "2026-10-10T21:00:00.000Z", updatedAt: "2026-10-10T22:20:00.000Z", ...overrides });
const draft = (overrides = {}) => ({ id: "draft-1", planId: "daily-x:2026-10-11:primary", planSlotId: "daily-x:2026-10-11:primary:0", sourceResearchIds: ["r1", "r2"], xAccountId: "primary", purpose: "reach", genreId: "ai", text: "AIを使う前に、目的を一文で決めると迷いが減ります。", urls: [], needsDisclosure: false, similarityScore: 0.1, status: "published", scheduledAt: "2026-10-10T22:30:00.000Z", publishedAt: "2026-10-10T22:31:00.000Z", bufferPostId: "buffer-1", xPostId: "123", bufferExternalLink: "https://x.com/example/status/123", metricsLastSyncedAt: "2026-10-11T01:00:00.000Z", createdAt: "2026-10-10T22:00:00.000Z", updatedAt: "2026-10-11T01:00:00.000Z", ...overrides });
const performance = (overrides = {}) => ({ contentId: "draft-1", platform: "x", purpose: "reach", genreId: "ai", publishedAt: "2026-10-10T22:31:00.000Z", impressions: 100, likes: 5, ...overrides });

test("Plan → Buffer → Published → Performance → Brief lineageをread-only projectionへ結合する", () => {
  const result = buildXObservabilityProjection({ plans: [plan()], drafts: [draft()], performance: [performance()], clusters: [cluster()], morningBrief: { briefDate: "2026-10-11", publishedCount: 1, successfulPostCount: 1, failedPostCount: 0, skippedPostCount: 0, performanceAvailableCount: 1, referencedPostIds: ["123"] }, now });
  const item = result.slots[0];
  assert.equal(result.readOnly, true);
  assert.equal(item.pipelineStage, "PERFORMANCE_SYNCED");
  assert.equal(item.publication.state, "CONFIRMED");
  assert.equal(item.performance.impressions, 100);
  assert.equal(item.performance.replies, null, "未取得metricは0にしない");
  assert.equal(result.morningBrief.reconciliation, "MATCHED");
});

test("BufferのみはPublishedにせず、過時刻ならreconciliation対象にする", () => {
  const result = buildXObservabilityProjection({ plans: [plan()], drafts: [draft({ status: "queued", xPostId: undefined, bufferExternalLink: undefined, publishedAt: undefined, metricsLastSyncedAt: undefined })], performance: [], clusters: [cluster()], now });
  assert.equal(result.slots[0].publication.state, "PENDING");
  assert.equal(result.slots[0].publication.published, null);
  assert.ok(result.slots[0].reconciliationCodes.includes("PROVIDER_PUBLISH_NOT_CONFIRMED"));
});

test("X publish後のPerformance欠損はpublicationを失敗へ戻さない", () => {
  const result = buildXObservabilityProjection({ plans: [plan()], drafts: [draft()], performance: [], clusters: [cluster()], now });
  assert.equal(result.slots[0].publication.state, "CONFIRMED");
  assert.equal(result.slots[0].performance.syncStatus, "PENDING");
  assert.ok(result.slots[0].reconciliationCodes.includes("PERFORMANCE_PENDING"));
});

test("同一plan/slotの複数publishを自動選択せずDUPLICATE_CONFIRMEDにする", () => {
  const result = buildXObservabilityProjection({ plans: [plan()], drafts: [draft(), draft({ id: "draft-2", xPostId: "456", bufferExternalLink: "https://x.com/example/status/456" })], performance: [], clusters: [cluster()], now });
  assert.equal(result.slots[0].draft.draftId, null);
  assert.equal(result.slots[0].duplicateStatus, "DUPLICATE_CONFIRMED");
});

test("LOW skipは異常ではなくHEALTHY_WITH_SKIP", () => {
  const lowSlot = slot({ status: "skipped", draftId: undefined, bufferPostId: undefined, failureReason: "Hot Confidence LOW" });
  const result = buildXObservabilityProjection({ plans: [plan([lowSlot])], drafts: [], performance: [], clusters: [cluster({ hotConfidence: "LOW" })], now });
  assert.equal(result.slots[0].skip.reason, "NORMAL_SKIP_LOW_CONFIDENCE");
  assert.equal(result.slots[0].status, "HEALTHY_WITH_SKIP");
});

test("Safety UNKNOWNの公開はPASSへ推測せず証跡不足を返す", () => {
  const result = buildXObservabilityProjection({ plans: [plan()], drafts: [draft()], performance: [performance()], clusters: [cluster()], now });
  assert.equal(result.slots[0].gates.safety, "UNKNOWN");
  assert.ok(result.slots[0].reconciliationCodes.includes("SAFETY_INTEGRITY_VIOLATION"));
  assert.equal(result.slots[0].status, "INTEGRITY_VIOLATION");
  assert.equal(result.slots[0].draft.preview, null, "Observabilityは本文previewを既定で返さない");
});

test("Morning Brief参照欠損とstale researchを観測する", () => {
  const result = buildXObservabilityProjection({ plans: [plan()], drafts: [draft()], performance: [performance()], clusters: [cluster({ lastDetectedAt: "2026-09-01T00:00:00.000Z" })], morningBrief: { briefDate: "2026-10-11", publishedCount: 0, successfulPostCount: 0, failedPostCount: 0, skippedPostCount: 0, performanceAvailableCount: 0, referencedPostIds: [] }, now });
  assert.equal(result.slots[0].research.freshness, "STALE");
  assert.equal(result.morningBrief.reconciliation, "RECONCILIATION_REQUIRED");
});
