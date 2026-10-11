import { createHash } from "node:crypto";
import type { ContentPerformance, DailyXPlan, SocialDraft, TrendCluster } from "../../note/research/types";
import type { MorningBriefEvidence } from "../morningBrief/evidenceContract";
import { xWeightedLength } from "../../note/operations";
import { readGateEvidence } from "./gateEvidenceReader";
import type { ObservabilityHealth, XObservabilityProjection, XPipelineStage, XSlotObservation } from "./types";

export type XProjectionInput = { plans: DailyXPlan[]; drafts: SocialDraft[]; performance: ContentPerformance[]; clusters: TrendCluster[]; morningBrief?: MorningBriefEvidence | null; now?: Date };

const hash = (text: string) => createHash("sha256").update(text).digest("hex");
const metric = (value: number | undefined): number | null => typeof value === "number" ? value : null;
const validXUrl = (value?: string) => Boolean(value && /^https:\/\/(?:x\.com|twitter\.com)\/[^/]+\/status\/\d+(?:\?.*)?$/.test(value));

function stage(slot: DailyXPlan["slots"][number], draft?: SocialDraft, perf?: ContentPerformance): XPipelineStage {
  if (perf) return "PERFORMANCE_SYNCED";
  if (draft?.xPostId && validXUrl(draft.bufferExternalLink) && draft.publishedAt) return "PUBLISHED";
  if (slot.status === "scheduled" || draft?.status === "scheduled" || draft?.status === "queued") return "SCHEDULED";
  if (slot.status === "ambiguous") return "UNKNOWN";
  if (slot.status === "blocked") return "BLOCKED";
  if (slot.status === "failed") return "FAILED";
  if (slot.status === "skipped" || slot.status === "missed") return "SKIPPED";
  if (slot.status === "generated") return "GENERATED";
  return "UNKNOWN";
}

function statusFor(codes: string[], pipeline: XPipelineStage, normalSkip: boolean): ObservabilityHealth {
  if (codes.some((code) => code.includes("INTEGRITY"))) return "INTEGRITY_VIOLATION";
  if (codes.some((code) => code.includes("DUPLICATE") || code.includes("RECONCILIATION") || code.includes("NOT_CONFIRMED"))) return "RECONCILIATION_REQUIRED";
  if (normalSkip) return "HEALTHY_WITH_SKIP";
  if (["SCHEDULED", "GENERATED"].includes(pipeline)) return "PENDING";
  if (pipeline === "FAILED" || pipeline === "BLOCKED") return "DEGRADED";
  if (pipeline === "UNKNOWN") return "DATA_INCOMPLETE";
  return "HEALTHY";
}

export function buildXObservabilityProjection(input: XProjectionInput): XObservabilityProjection {
  const now = input.now ?? new Date();
  const lineageCount = new Map<string, { drafts: number; published: number; external: Set<string>; hashes: Set<string> }>();
  for (const draft of input.drafts) {
    if (!draft.planId || !draft.planSlotId) continue;
    const key = `${draft.planId}\u0000${draft.planSlotId}`;
    const item = lineageCount.get(key) ?? { drafts: 0, published: 0, external: new Set<string>(), hashes: new Set<string>() };
    item.drafts++;
    if (draft.xPostId || (draft.status === "published" && validXUrl(draft.bufferExternalLink))) item.published++;
    if (draft.xPostId) item.external.add(draft.xPostId);
    if (draft.text) item.hashes.add(hash(draft.text));
    lineageCount.set(key, item);
  }

  const slots: XSlotObservation[] = input.plans.flatMap((plan) => plan.slots.map((slot) => {
    const matching = input.drafts.filter((draft) => draft.planId === plan.id && draft.planSlotId === slot.id);
    const draft = matching.length === 1 ? matching[0] : undefined;
    const perf = draft ? input.performance.find((record) => record.platform === "x" && record.contentId === draft.id) : undefined;
    const cluster = input.clusters.find((item) => item.id === slot.candidateRef?.id);
    const pipeline = stage(slot, draft, perf);
    const evidence = draft?.sourceResearchIds ?? [];
    const timestamps = input.clusters.filter((item) => item.id === slot.candidateRef?.id).flatMap((item) => [item.firstDetectedAt, item.lastDetectedAt]).filter(Boolean).sort();
    const normalLowSkip = slot.status === "skipped" && cluster?.hotConfidence === "LOW";
    const codes: string[] = [];
    const duplicate = lineageCount.get(`${plan.id}\u0000${slot.id}`);
    const duplicateStatus = duplicate && duplicate.published > 1 ? "DUPLICATE_CONFIRMED" : duplicate && duplicate.drafts > 1 ? "DUPLICATE_RISK" : "NONE";
    if (duplicateStatus !== "NONE") codes.push(duplicateStatus);
    if ((slot.bufferPostId || draft?.bufferPostId) && !draft?.xPostId && slot.status === "scheduled" && Date.parse(slot.scheduledAt) < now.getTime()) codes.push("PROVIDER_PUBLISH_NOT_CONFIRMED");
    if (draft?.xPostId && !perf) codes.push("PERFORMANCE_PENDING");
    const gates = readGateEvidence(plan, slot, draft?.id);
    if (pipeline === "PUBLISHED" || pipeline === "PERFORMANCE_SYNCED") {
      if (gates.safety === "FAIL" || gates.safety === "BLOCKED") codes.push("SAFETY_INTEGRITY_VIOLATION");
      if (gates.fact === "FAIL" || gates.fact === "BLOCKED") codes.push("FACT_INTEGRITY_VIOLATION");
      if (gates.publishEligibility === "FAIL" || gates.publishEligibility === "BLOCKED") codes.push("PUBLISH_ELIGIBILITY_INTEGRITY_VIOLATION");
    }
    const slotStatus = statusFor(codes, pipeline, normalLowSkip);
    return {
      plan: { planId: plan.id, planDate: plan.date, planVersion: null, slotId: slot.id, slotTime: slot.scheduledTime, topic: cluster?.title ?? null, platform: "x", intendedContentType: slot.operationRole, sourceResearchIds: evidence, hotConfidence: cluster?.hotConfidence ?? null, candidateRank: null, generatedAt: plan.generatedAt },
      draft: { draftId: draft?.id ?? null, createdAt: draft?.createdAt ?? null, weightedLength: draft ? xWeightedLength(draft.text) : null, contentHash: draft ? hash(draft.text) : null, preview: null, similarityScore: draft?.similarityScore ?? null, duplicateCandidate: draft?.similarTo ?? null, sourceLineage: [...evidence, ...(draft?.sourceViewpointIds ?? []), ...(draft?.sourceExperienceIds ?? [])] },
      gates, pipelineStage: pipeline,
      buffer: { requestObserved: Boolean(slot.bufferPostId || draft?.bufferPostId) || null, updateId: slot.bufferPostId ?? draft?.bufferPostId ?? null, providerJobId: slot.bufferPostId ?? draft?.bufferPostId ?? null, requestedScheduleTime: draft?.scheduledAt ?? slot.scheduledAt ?? null, actualProviderScheduleTime: null, providerStatus: slot.status, providerError: slot.failureKind ?? (draft?.failureReason ? "DRAFT_FAILURE_RECORDED" : null), createdAt: draft?.createdAt ?? null, updatedAt: draft?.updatedAt ?? slot.updatedAt ?? null },
      publication: { state: draft?.xPostId && validXUrl(draft.bufferExternalLink) && draft.publishedAt ? "CONFIRMED" : slot.status === "ambiguous" ? "AMBIGUOUS" : slot.status === "scheduled" ? "PENDING" : "UNKNOWN", published: draft?.xPostId && validXUrl(draft.bufferExternalLink) && draft.publishedAt ? true : null, externalPostId: draft?.xPostId ?? null, externalUrl: validXUrl(draft?.bufferExternalLink) ? draft!.bufferExternalLink! : null, actualPublishedAt: draft?.publishedAt ?? null, provider: draft?.bufferPostId ? "buffer" : null, expectedPublishedAt: draft?.scheduledAt ?? slot.scheduledAt ?? null, delayMs: draft?.publishedAt ? Date.parse(draft.publishedAt) - Date.parse(draft.scheduledAt ?? slot.scheduledAt) : null, mismatch: draft?.bufferExternalLink && !validXUrl(draft.bufferExternalLink) ? true : null },
      performance: { performanceRecordId: perf ? `${perf.platform}:${perf.contentId}:${perf.publishedAt}` : null, impressions: metric(perf?.impressions), likes: metric(perf?.likes), replies: metric(perf?.replies), reposts: metric(perf?.reposts), bookmarks: metric(perf?.bookmarks), clicks: metric(perf?.linkClicks ?? perf?.urlClicks), measuredAt: draft?.metricsLastSyncedAt ?? null, syncStatus: perf ? "SYNCED" : draft?.metricsSyncError ? "UNAVAILABLE" : draft?.xPostId ? "PENDING" : "UNKNOWN", provider: perf ? "canonical-performance" : null, freshness: perf && draft?.metricsLastSyncedAt ? (now.getTime() - Date.parse(draft.metricsLastSyncedAt) <= 86_400_000 ? "FRESH" : "STALE") : "UNKNOWN" },
      research: { sourceCount: evidence.length || null, latestObservedAt: timestamps.at(-1) ?? null, oldestObservedAt: timestamps[0] ?? null, freshness: cluster ? (now.getTime() - Date.parse(cluster.lastDetectedAt) <= 48 * 3_600_000 ? "FRESH" : "STALE") : evidence.length ? "INCOMPLETE" : "UNKNOWN", trustTier: null, evidenceCoverage: cluster?.hotScoreBreakdown?.availableWeight ?? null },
      skip: { normal: normalLowSkip, reason: normalLowSkip ? "NORMAL_SKIP_LOW_CONFIDENCE" : slot.status === "skipped" ? "SKIPPED" : null },
      duplicateStatus, reconciliationCodes: codes, isCanary: plan.origin === "one-time-transport-canary", canary: { canaryType: plan.origin ?? null, canaryId: plan.origin ? plan.id : null, initiatedAt: plan.origin ? plan.generatedAt : null, purpose: plan.origin ? "transport verification" : null }, status: slotStatus,
    } satisfies XSlotObservation;
  }));

  const briefReconciliation: XObservabilityProjection["reconciliation"] = [];
  if (input.morningBrief) {
    const referenced = new Set(input.morningBrief.referencedPostIds);
    const confirmed = slots.filter((item) => item.publication.state === "CONFIRMED");
    const referencedDates = new Set(confirmed.filter((item) => item.publication.externalPostId && referenced.has(item.publication.externalPostId)).map((item) => item.plan.planDate));
    const previousBriefDate = new Date(`${input.morningBrief.briefDate}T12:00:00.000Z`);
    previousBriefDate.setUTCDate(previousBriefDate.getUTCDate() - 1);
    const fallbackDate = previousBriefDate.toISOString().slice(0, 10);
    const relevant = confirmed.filter((item) => referencedDates.size > 0 ? referencedDates.has(item.plan.planDate) : item.plan.planDate === fallbackDate);
    for (const item of relevant) {
      if (item.publication.externalPostId && !referenced.has(item.publication.externalPostId)) item.reconciliationCodes.push("BRIEF_RECONCILIATION_REQUIRED");
    }
    if (relevant.length !== input.morningBrief.successfulPostCount) {
      briefReconciliation.push({ planId: input.morningBrief.briefId, slotId: "summary", code: "RECONCILIATION_REQUIRED", status: "RECONCILIATION_REQUIRED" });
    }
    if (input.morningBrief.performanceAvailableCount < relevant.length) {
      briefReconciliation.push({ planId: input.morningBrief.briefId, slotId: "summary", code: "PERFORMANCE_RECONCILIATION_REQUIRED", status: "RECONCILIATION_REQUIRED" });
    }
  }
  for (const slot of slots) slot.status = statusFor(slot.reconciliationCodes, slot.pipelineStage, slot.skip.normal);
  const reconciliation = [...slots.flatMap((slot) => slot.reconciliationCodes.map((code) => ({ planId: slot.plan.planId, slotId: slot.plan.slotId, code, status: code.includes("INTEGRITY") ? "INTEGRITY_VIOLATION" as const : code.includes("INCOMPLETE") || code === "PERFORMANCE_PENDING" ? "DATA_INCOMPLETE" as const : "RECONCILIATION_REQUIRED" as const }))), ...briefReconciliation];
  const priority: ObservabilityHealth[] = ["INTEGRITY_VIOLATION", "RECONCILIATION_REQUIRED", "DEGRADED", "DATA_INCOMPLETE", "PENDING", "HEALTHY_WITH_SKIP", "HEALTHY", "UNKNOWN"];
  const overall = priority.find((value) => slots.some((slot) => slot.status === value) || reconciliation.some((item) => item.status === value)) ?? "UNKNOWN";
  const briefNeedsReconciliation = reconciliation.some((item) => ["RECONCILIATION_REQUIRED", "BRIEF_RECONCILIATION_REQUIRED", "PERFORMANCE_RECONCILIATION_REQUIRED"].includes(item.code));
  return { observedAt: now.toISOString(), readOnly: true, status: overall, slots, summary: { plans: input.plans.length, slots: slots.length, published: slots.filter((slot) => slot.publication.state === "CONFIRMED").length, performanceSynced: slots.filter((slot) => slot.performance.syncStatus === "SYNCED").length, normalLowSkips: slots.filter((slot) => slot.skip.normal).length, duplicateRisks: slots.filter((slot) => slot.duplicateStatus !== "NONE").length, integrityViolations: slots.filter((slot) => slot.status === "INTEGRITY_VIOLATION").length }, morningBrief: input.morningBrief ? { availability: "AVAILABLE", briefDate: input.morningBrief.briefDate, publishedCount: input.morningBrief.publishedCount, successfulPostCount: input.morningBrief.successfulPostCount, failedPostCount: input.morningBrief.failedPostCount, skippedPostCount: input.morningBrief.skippedPostCount, performanceAvailableCount: input.morningBrief.performanceAvailableCount, referencedPostIds: input.morningBrief.referencedPostIds, generatedAt: input.morningBrief.generatedAt, deliveredAt: input.morningBrief.deliveredAt ?? null, status: input.morningBrief.status, reconciliation: briefNeedsReconciliation ? "RECONCILIATION_REQUIRED" : "MATCHED" } : { availability: "UNAVAILABLE", briefDate: null, publishedCount: null, successfulPostCount: null, failedPostCount: null, skippedPostCount: null, performanceAvailableCount: null, referencedPostIds: [], generatedAt: null, deliveredAt: null, status: "UNKNOWN", reconciliation: "UNKNOWN" }, reconciliation };
}
