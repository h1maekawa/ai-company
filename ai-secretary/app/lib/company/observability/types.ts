export type ObservationValue = "PASS" | "FAIL" | "BLOCKED" | "UNKNOWN";
export type XPipelineStage =
  | "GENERATED" | "VALIDATED" | "ELIGIBLE" | "SCHEDULE_REQUESTED"
  | "PROVIDER_ACCEPTED" | "SCHEDULED" | "PUBLISHED" | "PERFORMANCE_SYNCED"
  | "SKIPPED" | "BLOCKED" | "FAILED" | "UNKNOWN";
export type XPublishConfirmation = "CONFIRMED" | "NOT_FOUND" | "PENDING" | "AMBIGUOUS" | "UNKNOWN";
export type DuplicateStatus = "NONE" | "DUPLICATE_RISK" | "DUPLICATE_CONFIRMED";
export type ObservabilityHealth =
  | "HEALTHY" | "HEALTHY_WITH_SKIP" | "PENDING" | "DEGRADED"
  | "RECONCILIATION_REQUIRED" | "INTEGRITY_VIOLATION" | "DATA_INCOMPLETE" | "UNKNOWN";

export type SafeMetric = number | null;

export type XSlotObservation = {
  plan: {
    planId: string; planDate: string; planVersion: null; slotId: string; slotTime: string;
    topic: string | null; platform: "x"; intendedContentType: string; sourceResearchIds: string[];
    hotConfidence: "LOW" | "MEDIUM" | "HIGH" | null; candidateRank: null; generatedAt: string;
  };
  draft: {
    draftId: string | null; createdAt: string | null; weightedLength: number | null;
    contentHash: string | null; preview: string | null; similarityScore: number | null;
    duplicateCandidate: string | null; sourceLineage: string[];
  };
  gates: { safety: ObservationValue; fact: ObservationValue; publishEligibility: ObservationValue };
  pipelineStage: XPipelineStage;
  buffer: {
    requestObserved: boolean | null; updateId: string | null; providerJobId: string | null;
    requestedScheduleTime: string | null; actualProviderScheduleTime: string | null;
    providerStatus: string | null; providerError: string | null; createdAt: string | null; updatedAt: string | null;
  };
  publication: {
    state: XPublishConfirmation; published: boolean | null; externalPostId: string | null;
    externalUrl: string | null; actualPublishedAt: string | null; provider: "buffer" | null;
    expectedPublishedAt: string | null; delayMs: number | null; mismatch: boolean | null;
  };
  performance: {
    performanceRecordId: string | null; impressions: SafeMetric; likes: SafeMetric; replies: SafeMetric;
    reposts: SafeMetric; bookmarks: SafeMetric; clicks: SafeMetric; measuredAt: string | null;
    syncStatus: "SYNCED" | "PENDING" | "UNAVAILABLE" | "UNKNOWN"; provider: string | null;
    freshness: "FRESH" | "STALE" | "UNKNOWN";
  };
  research: {
    sourceCount: number | null; latestObservedAt: string | null; oldestObservedAt: string | null;
    freshness: "FRESH" | "STALE" | "INCOMPLETE" | "UNKNOWN"; trustTier: string | null;
    evidenceCoverage: number | null;
  };
  skip: { normal: boolean; reason: string | null };
  duplicateStatus: DuplicateStatus;
  reconciliationCodes: string[];
  isCanary: boolean;
  canary: { canaryType: string | null; canaryId: string | null; initiatedAt: string | null; purpose: string | null };
  status: ObservabilityHealth;
};

export type XObservabilityProjection = {
  observedAt: string;
  readOnly: true;
  status: ObservabilityHealth;
  slots: XSlotObservation[];
  summary: {
    plans: number; slots: number; published: number; performanceSynced: number;
    normalLowSkips: number; duplicateRisks: number; integrityViolations: number;
  };
  morningBrief: {
    availability: "AVAILABLE" | "UNAVAILABLE";
    briefDate: string | null; publishedCount: number | null; successfulPostCount: number | null;
    failedPostCount: number | null; skippedPostCount: number | null; performanceAvailableCount: number | null;
    referencedPostIds: string[]; reconciliation: "MATCHED" | "RECONCILIATION_REQUIRED" | "UNKNOWN";
  };
  reconciliation: Array<{ planId: string; slotId: string; code: string; status: ObservabilityHealth }>;
};
