import type { ExecutionStore } from "../runtime/runtimeTypes";

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
const MORNING_BRIEF_EVIDENCE_TTL_SECONDS = 400 * 24 * 60 * 60;

export function isMorningBriefEvidence(value: unknown): value is MorningBriefEvidence {
  if (!value || typeof value !== "object") return false;
  const evidence = value as Partial<MorningBriefEvidence>;
  return typeof evidence.briefId === "string" && typeof evidence.briefDate === "string" &&
    Array.isArray(evidence.referencedPostIds) && typeof evidence.generatedAt === "string" &&
    ["GENERATED", "DELIVERED", "PARTIAL", "FAILED", "UNKNOWN"].includes(evidence.status ?? "");
}

/** Existing Execution Store, separate from delivery idempotency. */
export async function saveMorningBriefEvidence(store: ExecutionStore, evidence: MorningBriefEvidence): Promise<void> {
  await store.completeIdempotency(MORNING_BRIEF_EVIDENCE_SCOPE, evidence.briefId, evidence, MORNING_BRIEF_EVIDENCE_TTL_SECONDS);
}

export async function loadMorningBriefEvidence(store: ExecutionStore, briefId: string): Promise<MorningBriefEvidence | null> {
  return store.getIdempotencyResult<MorningBriefEvidence>(MORNING_BRIEF_EVIDENCE_SCOPE, briefId);
}
