import type { SocialDraft } from "../research/types";
import { parseXPostUrl } from "../x/urls";
import type { BufferPostPublicationEvidence } from "./buffer";

export type CanaryCandidateReason =
  | "CANDIDATE_MISSING_BUFFER_POST_ID"
  | "CANDIDATE_MISSING_SCHEDULED_AT"
  | "CANDIDATE_MISSING_PLAN_ID"
  | "CANDIDATE_MISSING_PLAN_SLOT_ID"
  | "AMBIGUOUS_DUPLICATE_LINEAGE";

export type CanaryPublicationReason =
  | "BUFFER_POST_NOT_SENT"
  | "BUFFER_SENT_AT_MISSING"
  | "BUFFER_EXTERNAL_LINK_MISSING"
  | "INVALID_X_EXTERNAL_LINK";

export function canaryCandidateReason(draft: SocialDraft): CanaryCandidateReason | null {
  if (!draft.bufferPostId) return "CANDIDATE_MISSING_BUFFER_POST_ID";
  if (!draft.scheduledAt) return "CANDIDATE_MISSING_SCHEDULED_AT";
  if (!draft.planId) return "CANDIDATE_MISSING_PLAN_ID";
  if (!draft.planSlotId) return "CANDIDATE_MISSING_PLAN_SLOT_ID";
  return null;
}

export function duplicateCanaryLineageIds(drafts: SocialDraft[]): Set<string> {
  const groups = new Map<string, SocialDraft[]>();
  for (const draft of drafts.filter((item) => item.id.startsWith("x-canary-"))) {
    if (canaryCandidateReason(draft)) continue;
    const key = `${draft.planId}\u0000${draft.planSlotId}`;
    groups.set(key, [...(groups.get(key) ?? []), draft]);
  }
  return new Set(
    [...groups.values()].filter((group) => group.length > 1).flatMap((group) => group.map((draft) => draft.id))
  );
}

export function confirmCanaryPublication(
  draft: SocialDraft,
  evidence: BufferPostPublicationEvidence
): { ok: true; draft: SocialDraft; postId: string } | { ok: false; reason: CanaryPublicationReason } {
  if (evidence.status !== "sent") return { ok: false, reason: "BUFFER_POST_NOT_SENT" };
  if (!evidence.sentAt) return { ok: false, reason: "BUFFER_SENT_AT_MISSING" };
  if (!evidence.externalLink) return { ok: false, reason: "BUFFER_EXTERNAL_LINK_MISSING" };
  const parsed = parseXPostUrl(evidence.externalLink);
  if (!parsed?.postId || (draft.xPostId && draft.xPostId !== parsed.postId)) {
    return { ok: false, reason: "INVALID_X_EXTERNAL_LINK" };
  }
  return {
    ok: true,
    postId: parsed.postId,
    draft: {
      ...draft,
      status: "published",
      publishedAt: evidence.sentAt,
      bufferExternalLink: evidence.externalLink,
      xPostId: parsed.postId,
      metricsSyncError: undefined,
    },
  };
}
