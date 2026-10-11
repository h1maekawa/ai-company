import { createHash } from "node:crypto";
import type { ContentPerformance, DailyXPlan, SocialDraft, TrendCluster } from "../../note/research/types";
import { xWeightedLength } from "../../note/operations";
import type { ObservabilityHealth, XObservabilityProjection, XPipelineStage, XSlotObservation } from "./types";

export type MorningBriefEvidence = { briefDate: string; publishedCount: number; successfulPostCount: number; failedPostCount: number; skippedPostCount: number; performanceAvailableCount: number; referencedPostIds: string[] };
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
    const safety: XSlotObservation["gates"]["safety"] = slot.status === "blocked" && /safety/i.test(slot.failureReason ?? "") ? "FAIL" : "UNKNOWN";
    const fact: XSlotObservation["gates"]["fact"] = slot.status === "blocked" && /fact/i.test(slot.failureReason ?? "") ? "FAIL" : "UNKNOWN";
    const eligibility: XSlotObservation["gates"]["publishEligibility"] = slot.status === "blocked" ? "BLOCKED" : "UNKNOWN";
    if (pipeline === "PUBLISHED" || pipeline === "PERFORMANCE_SYNCED") {
      if (safety === "UNKNOWN") codes.push("SAFETY_INTEGRITY_VIOLATION");
      if (fact === "UNKNOWN") codes.push("FACT_EVIDENCE_INCOMPLETE");
      if (eligibility === "UNKNOWN") codes.push("ELIGIBILITY_EVIDENCE_INCOMPLETE");
    }
    const slotStatus = statusFor(codes, pipeline, normalLowSkip);
    return {
      plan: { planId: plan.id, planDate: plan.date, planVersion: null, slotId: slot.id, slotTime: slot.scheduledTime, topic: cluster?.title ?? null, platform: "x", intendedContentType: slot.operationRole, sourceResearchIds: evidence, hotConfidence: cluster?.hotConfidence ?? null, candidateRank: null, generatedAt: plan.generatedAt },
      draft: { draftId: draft?.id ?? null, createdAt: draft?.createdAt ?? null, weightedLength: draft ? xWeightedLength(draft.text) : null, contentHash: draft ? hash(draft.text) : null, preview: null, similarityScore: draft?.similarityScore ?? null, duplicateCandidate: draft?.similarTo ?? null, sourceLineage: [...evidence, ...(draft?.sourceViewpointIds ?? []), ...(draft?.sourceExperienceIds ?? [])] },
      gates: { safety, fact, publishEligibility: eligibility }, pipelineStage: pipeline,
      buffer: { requestObserved: Boolean(slot.bufferPostId || draft?.bufferPostId) || null, updateId: slot.bufferPostId ?? draft?.bufferPostId ?? null, providerJobId: slot.bufferPostId ?? draft?.bufferPostId ?? null, requestedScheduleTime: draft?.scheduledAt ?? slot.scheduledAt ?? null, actualProviderScheduleTime: null, providerStatus: slot.status, providerError: slot.failureKind ?? (draft?.failureReason ? "DRAFT_FAILURE_RECORDED" : null), createdAt: draft?.createdAt ?? null, updatedAt: draft?.updatedAt ?? slot.updatedAt ?? null },
      publication: { state: draft?.xPostId && validXUrl(draft.bufferExternalLink) && draft.publishedAt ? "CONFIRMED" : slot.status === "ambiguous" ? "AMBIGUOUS" : slot.status === "scheduled" ? "PENDING" : "UNKNOWN", published: draft?.xPostId && validXUrl(draft.bufferExternalLink) && draft.publishedAt ? true : null, externalPostId: draft?.xPostId ?? null, externalUrl: validXUrl(draft?.bufferExternalLink) ? draft!.bufferExternalLink! : null, actualPublishedAt: draft?.publishedAt ?? null, provider: draft?.bufferPostId ? "buffer" : null, expectedPublishedAt: draft?.scheduledAt ?? slot.scheduledAt ?? null, delayMs: draft?.publishedAt ? Date.parse(draft.publishedAt) - Date.parse(draft.scheduledAt ?? slot.scheduledAt) : null, mismatch: draft?.bufferExternalLink && !validXUrl(draft.bufferExternalLink) ? true : null },
      performance: { performanceRecordId: perf ? `${perf.platform}:${perf.contentId}:${perf.publishedAt}` : null, impressions: metric(perf?.impressions), likes: metric(perf?.likes), replies: metric(perf?.replies), reposts: metric(perf?.reposts), bookmarks: metric(perf?.bookmarks), clicks: metric(perf?.linkClicks ?? perf?.urlClicks), measuredAt: draft?.metricsLastSyncedAt ?? null, syncStatus: perf ? "SYNCED" : draft?.metricsSyncError ? "UNAVAILABLE" : draft?.xPostId ? "PENDING" : "UNKNOWN", provider: perf ? "canonical-performance" : null, freshness: perf && draft?.metricsLastSyncedAt ? (now.getTime() - Date.parse(draft.metricsLastSyncedAt) <= 86_400_000 ? "FRESH" : "STALE") : "UNKNOWN" },
      research: { sourceCount: evidence.length || null, latestObservedAt: timestamps.at(-1) ?? null, oldestObservedAt: timestamps[0] ?? null, freshness: cluster ? (now.getTime() - Date.parse(cluster.lastDetectedAt) <= 48 * 3_600_000 ? "FRESH" : "STALE") : evidence.length ? "INCOMPLETE" : "UNKNOWN", trustTier: null, evidenceCoverage: cluster?.hotScoreBreakdown?.availableWeight ?? null },
      skip: { normal: normalLowSkip, reason: normalLowSkip ? "NORMAL_SKIP_LOW_CONFIDENCE" : slot.status === "skipped" ? "SKIPPED" : null },
      duplicateStatus, reconciliationCodes: codes, isCanary: plan.origin === "one-time-transport-canary", canary: { canaryType: plan.origin ?? null, canaryId: plan.origin ? plan.id : null, initiatedAt: plan.origin ? plan.generatedAt : null, purpose: plan.origin ? "transport verification" : null }, status: slotStatus,
    } satisfies XSlotObservation;
  }));

  if (input.morningBrief) {
    const referenced = new Set(input.morningBrief.referencedPostIds);
    for (const slot of slots.filter((item) => item.publication.state === "CONFIRMED" && item.plan.planDate === input.morningBrief!.briefDate)) {
      if (slot.publication.externalPostId && !referenced.has(slot.publication.externalPostId)) slot.reconciliationCodes.push("BRIEF_RECONCILIATION_REQUIRED");
    }
  }
  const reconciliation = slots.flatMap((slot) => slot.reconciliationCodes.map((code) => ({ planId: slot.plan.planId, slotId: slot.plan.slotId, code, status: code.includes("INTEGRITY") ? "INTEGRITY_VIOLATION" as const : code.includes("INCOMPLETE") || code === "PERFORMANCE_PENDING" ? "DATA_INCOMPLETE" as const : "RECONCILIATION_REQUIRED" as const })));
  const priority: ObservabilityHealth[] = ["INTEGRITY_VIOLATION", "RECONCILIATION_REQUIRED", "DEGRADED", "DATA_INCOMPLETE", "PENDING", "HEALTHY_WITH_SKIP", "HEALTHY", "UNKNOWN"];
  const overall = priority.find((value) => slots.some((slot) => slot.status === value)) ?? "UNKNOWN";
  return { observedAt: now.toISOString(), readOnly: true, status: overall, slots, summary: { plans: input.plans.length, slots: slots.length, published: slots.filter((slot) => slot.publication.state === "CONFIRMED").length, performanceSynced: slots.filter((slot) => slot.performance.syncStatus === "SYNCED").length, normalLowSkips: slots.filter((slot) => slot.skip.normal).length, duplicateRisks: slots.filter((slot) => slot.duplicateStatus !== "NONE").length, integrityViolations: slots.filter((slot) => slot.status === "INTEGRITY_VIOLATION").length }, morningBrief: input.morningBrief ? { availability: "AVAILABLE", ...input.morningBrief, reconciliation: reconciliation.some((item) => item.code === "BRIEF_RECONCILIATION_REQUIRED") ? "RECONCILIATION_REQUIRED" : "MATCHED" } : { availability: "UNAVAILABLE", briefDate: null, publishedCount: null, successfulPostCount: null, failedPostCount: null, skippedPostCount: null, performanceAvailableCount: null, referencedPostIds: [], reconciliation: "UNKNOWN" }, reconciliation };
}
