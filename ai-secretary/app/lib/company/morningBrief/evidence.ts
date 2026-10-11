import type { ExecutionStore } from "../runtime/runtimeTypes";
import { MORNING_BRIEF_EVIDENCE_SCOPE, type MorningBriefEvidence } from "./evidenceContract";
export { isMorningBriefEvidence, MORNING_BRIEF_EVIDENCE_SCOPE } from "./evidenceContract";
export type { MorningBriefEvidence, MorningBriefEvidenceStatus } from "./evidenceContract";
const MORNING_BRIEF_EVIDENCE_TTL_SECONDS = 400 * 24 * 60 * 60;

/** Existing Execution Store, separate from delivery idempotency. */
export async function saveMorningBriefEvidence(store: ExecutionStore, evidence: MorningBriefEvidence): Promise<void> {
  await store.completeIdempotency(MORNING_BRIEF_EVIDENCE_SCOPE, evidence.briefId, evidence, MORNING_BRIEF_EVIDENCE_TTL_SECONDS);
}

export async function loadMorningBriefEvidence(store: ExecutionStore, briefId: string): Promise<MorningBriefEvidence | null> {
  return store.getIdempotencyResult<MorningBriefEvidence>(MORNING_BRIEF_EVIDENCE_SCOPE, briefId);
}
