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
const gate = (gateType, result, overrides = {}) => ({ id: `gate-${gateType}`, gateType, result, reasonCode: `${gateType}_${result}`, policyVersion: "daily-x-v1", planId: "daily-x:2026-10-11:primary", slotId: "daily-x:2026-10-11:primary:0", draftId: "draft-1", evaluatedAt: "2026-10-10T22:20:00.000Z", source: "daily-x-execution", ...overrides });
const gates = (overrides = {}) => [gate("SAFETY", overrides.safety ?? "PASS"), gate("FACT", overrides.fact ?? "PASS"), gate("PUBLISH_ELIGIBILITY", overrides.publishEligibility ?? "PASS")];
const briefEvidence = (overrides = {}) => ({ briefId: "morning-brief:2026-10-12", briefDate: "2026-10-12", publishedCount: 1, successfulPostCount: 1, failedPostCount: 0, skippedPostCount: 0, performanceAvailableCount: 1, referencedPostIds: ["123"], generatedAt: "2026-10-11T22:00:00.000Z", deliveredAt: "2026-10-11T22:00:01.000Z", status: "DELIVERED", ...overrides });

test("Plan → Buffer → Published → Performance → Brief lineageをread-only projectionへ結合する", () => {
  const result = buildXObservabilityProjection({ plans: [plan(undefined, { gateEvidence: gates() })], drafts: [draft()], performance: [performance()], clusters: [cluster()], morningBrief: briefEvidence(), now });
  const item = result.slots[0];
  assert.equal(result.readOnly, true);
  assert.equal(item.pipelineStage, "PERFORMANCE_SYNCED");
  assert.equal(item.publication.state, "CONFIRMED");
  assert.equal(item.performance.impressions, 100);
  assert.equal(item.performance.replies, null, "未取得metricは0にしない");
  assert.deepEqual(item.gates, { safety: "PASS", fact: "PASS", publishEligibility: "PASS" });
  assert.equal(result.morningBrief.availability, "AVAILABLE");
  assert.equal(result.morningBrief.status, "DELIVERED");
  assert.equal(result.morningBrief.generatedAt, "2026-10-11T22:00:00.000Z");
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

test("Gate Evidenceなしの公開はUNKNOWNを維持しViolationと断定しない", () => {
  const result = buildXObservabilityProjection({ plans: [plan()], drafts: [draft()], performance: [performance()], clusters: [cluster()], now });
  assert.equal(result.slots[0].gates.safety, "UNKNOWN");
  assert.equal(result.slots[0].gates.fact, "UNKNOWN");
  assert.equal(result.slots[0].gates.publishEligibility, "UNKNOWN");
  assert.equal(result.slots[0].reconciliationCodes.some((code) => code.includes("INTEGRITY_VIOLATION")), false);
  assert.equal(result.slots[0].draft.preview, null, "Observabilityは本文previewを既定で返さない");
});

test("lineage不一致のGate EvidenceはUNKNOWN", () => {
  const mismatched = gates().map((item) => ({ ...item, draftId: "other-draft" }));
  const result = buildXObservabilityProjection({ plans: [plan(undefined, { gateEvidence: mismatched })], drafts: [draft()], performance: [performance()], clusters: [cluster()], now });
  assert.deepEqual(result.slots[0].gates, { safety: "UNKNOWN", fact: "UNKNOWN", publishEligibility: "UNKNOWN" });
});

for (const [gateName, values, expectedCode] of [
  ["Safety", { safety: "FAIL" }, "SAFETY_INTEGRITY_VIOLATION"],
  ["Fact", { fact: "FAIL" }, "FACT_INTEGRITY_VIOLATION"],
  ["Publish Eligibility", { publishEligibility: "BLOCKED" }, "PUBLISH_ELIGIBILITY_INTEGRITY_VIOLATION"],
]) test(`${gateName}不通過なのにPublishedならINTEGRITY_VIOLATION`, () => {
  const result = buildXObservabilityProjection({ plans: [plan(undefined, { gateEvidence: gates(values) })], drafts: [draft()], performance: [performance()], clusters: [cluster()], now });
  assert.ok(result.slots[0].reconciliationCodes.includes(expectedCode));
  assert.equal(result.slots[0].status, "INTEGRITY_VIOLATION");
});

test("Morning Brief EvidenceなしはUNAVAILABLE / UNKNOWN", () => {
  const result = buildXObservabilityProjection({ plans: [plan()], drafts: [draft()], performance: [performance()], clusters: [cluster()], now });
  assert.equal(result.morningBrief.availability, "UNAVAILABLE");
  assert.equal(result.morningBrief.reconciliation, "UNKNOWN");
  assert.equal(result.morningBrief.performanceAvailableCount, null);
});

test("published 3 / brief successful 2はRECONCILIATION_REQUIRED", () => {
  const slots = [0, 1, 2].map((index) => slot({ id: `daily-x:2026-10-11:primary:${index}`, slotIndex: index, draftId: `draft-${index + 1}` }));
  const drafts = [0, 1, 2].map((index) => draft({ id: `draft-${index + 1}`, planSlotId: slots[index].id, xPostId: String(123 + index), bufferExternalLink: `https://x.com/example/status/${123 + index}` }));
  const result = buildXObservabilityProjection({ plans: [plan(slots)], drafts, performance: [], clusters: [cluster()], morningBrief: briefEvidence({ successfulPostCount: 2, publishedCount: 3, performanceAvailableCount: 3, referencedPostIds: ["123", "124", "125"] }), now });
  assert.ok(result.reconciliation.some((item) => item.code === "RECONCILIATION_REQUIRED"));
  assert.equal(result.morningBrief.reconciliation, "RECONCILIATION_REQUIRED");
});

test("Morning Brief参照欠損とstale researchを観測する", () => {
  const result = buildXObservabilityProjection({ plans: [plan()], drafts: [draft()], performance: [performance()], clusters: [cluster({ lastDetectedAt: "2026-09-01T00:00:00.000Z" })], morningBrief: briefEvidence({ referencedPostIds: [], performanceAvailableCount: 1 }), now });
  assert.equal(result.slots[0].research.freshness, "STALE");
  assert.ok(result.reconciliation.some((item) => item.code === "BRIEF_RECONCILIATION_REQUIRED"));
  assert.equal(result.morningBrief.reconciliation, "RECONCILIATION_REQUIRED");
});

test("performanceAvailableCount不足はPERFORMANCE_RECONCILIATION_REQUIREDでmetrics nullを維持する", () => {
  const result = buildXObservabilityProjection({ plans: [plan()], drafts: [draft()], performance: [], clusters: [cluster()], morningBrief: briefEvidence({ performanceAvailableCount: 0 }), now });
  assert.ok(result.reconciliation.some((item) => item.code === "PERFORMANCE_RECONCILIATION_REQUIRED"));
  assert.equal(result.slots[0].performance.impressions, null);
  assert.equal(result.slots[0].performance.likes, null);
});
