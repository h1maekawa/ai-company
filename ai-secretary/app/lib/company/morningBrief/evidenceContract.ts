export type MorningBriefEvidenceStatus = "GENERATED" | "DELIVERED" | "PARTIAL" | "FAILED" | "UNKNOWN";

export type MorningBriefEvidence = {
  briefId: string;
  briefDate: string;
  referencedPostIds: string[];
  publishedCount: number;
  successfulPostCount: number;
  failedPostCount: number;
  skippedPostCount: number;
  performanceAvailableCount: number;
  generatedAt: string;
  deliveredAt?: string;
  status: MorningBriefEvidenceStatus;
};

export const MORNING_BRIEF_EVIDENCE_SCOPE = "morning-brief-evidence";

export function isMorningBriefEvidence(value: unknown): value is MorningBriefEvidence {
  if (!value || typeof value !== "object") return false;
  const evidence = value as Partial<MorningBriefEvidence>;
  return typeof evidence.briefId === "string" && typeof evidence.briefDate === "string" &&
    Array.isArray(evidence.referencedPostIds) && evidence.referencedPostIds.every((id) => typeof id === "string") &&
    [evidence.publishedCount, evidence.successfulPostCount, evidence.failedPostCount, evidence.skippedPostCount, evidence.performanceAvailableCount]
      .every((count) => typeof count === "number" && Number.isFinite(count) && count >= 0) &&
    typeof evidence.generatedAt === "string" &&
    (evidence.deliveredAt === undefined || typeof evidence.deliveredAt === "string") &&
    ["GENERATED", "DELIVERED", "PARTIAL", "FAILED", "UNKNOWN"].includes(evidence.status ?? "");
}
