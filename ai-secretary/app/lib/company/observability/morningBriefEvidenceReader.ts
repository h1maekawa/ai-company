import type { ExecutionStore } from "../runtime/runtimeTypes";
import { isMorningBriefEvidence, MORNING_BRIEF_EVIDENCE_SCOPE, type MorningBriefEvidence } from "../morningBrief/evidenceContract";

/** GET-only canonical evidence reader. It never repairs, retries, or completes idempotency. */
export async function readMorningBriefEvidence(store: ExecutionStore, briefDate: string): Promise<MorningBriefEvidence | null> {
  const briefId = `morning-brief:${briefDate}`;
  const evidence = await store.getIdempotencyResult<unknown>(MORNING_BRIEF_EVIDENCE_SCOPE, briefId);
  return isMorningBriefEvidence(evidence) && evidence.briefId === briefId && evidence.briefDate === briefDate ? evidence : null;
}
