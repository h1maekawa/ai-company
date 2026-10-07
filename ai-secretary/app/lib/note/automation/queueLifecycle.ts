import type { SocialDraft } from "../research/types";

export const ACTIVE_UNRESOLVED_LIMIT = 20;
export const TOPIC_UNRESOLVED_LIMIT = 3;
export const STALE_AFTER_MS = 48 * 60 * 60 * 1_000;
export const CLEANUP_CANDIDATE_AFTER_MS = 7 * 24 * 60 * 60 * 1_000;

export type QueueDerivedState =
  | "needs_review"
  | "qa_blocked"
  | "approved_unscheduled"
  | "stale"
  | "cleanup_candidate"
  | "linked_pending_reconciliation";

export type QueueLifecycleEntry = {
  draftId: string;
  trendClusterId?: string;
  derivedStates: QueueDerivedState[];
  activeUnresolved: boolean;
  cleanupProtected: boolean;
};

export type QueueLifecycleSnapshot = {
  entries: QueueLifecycleEntry[];
  activeUnresolved: number;
  unresolvedByTopic: Record<string, number>;
  saturatedTopics: string[];
  backpressure: boolean;
  reasons: string[];
};

const terminal = (draft: SocialDraft) => draft.status === "published" || draft.status === "discarded";
const linkedExternally = (draft: SocialDraft) => Boolean(draft.bufferPostId || draft.xPostId || draft.bufferExternalLink);
const ageMs = (draft: SocialDraft, now: Date) => Math.max(0, now.getTime() - Date.parse(draft.updatedAt || draft.createdAt));

/**
 * Queueの状態を読み取りだけで導出する。cleanupを実行する関数ではない。
 * Buffer / Xとのlinkがある行とold scheduledは、推測で再投稿・削除せずreconciliationへ送る。
 */
export function deriveQueueLifecycle(
  drafts: SocialDraft[],
  options: { now?: Date; qaPassedByDraftId?: Readonly<Record<string, boolean | undefined>> } = {}
): QueueLifecycleSnapshot {
  const now = options.now ?? new Date();
  const unresolvedByTopic: Record<string, number> = {};
  const entries = drafts.map((draft): QueueLifecycleEntry => {
    const activeUnresolved = !terminal(draft);
    const cleanupProtected = linkedExternally(draft) || draft.status === "queued" || draft.status === "scheduled";
    const age = ageMs(draft, now);
    const states: QueueDerivedState[] = [];

    if (activeUnresolved && (draft.status === "draft" || draft.status === "failed" || Boolean(draft.failureReason))) states.push("needs_review");
    if (activeUnresolved && (options.qaPassedByDraftId?.[draft.id] === false || Boolean(draft.failureReason))) states.push("qa_blocked");
    if (draft.status === "approved" && !draft.bufferPostId && !draft.scheduledAt) states.push("approved_unscheduled");
    if (activeUnresolved && age > STALE_AFTER_MS) states.push("stale");
    if (activeUnresolved && age > CLEANUP_CANDIDATE_AFTER_MS && !cleanupProtected) states.push("cleanup_candidate");
    if (activeUnresolved && cleanupProtected) states.push("linked_pending_reconciliation");

    if (activeUnresolved && draft.trendClusterId) {
      unresolvedByTopic[draft.trendClusterId] = (unresolvedByTopic[draft.trendClusterId] ?? 0) + 1;
    }
    return { draftId: draft.id, ...(draft.trendClusterId ? { trendClusterId: draft.trendClusterId } : {}), derivedStates: states, activeUnresolved, cleanupProtected };
  });

  const activeUnresolved = entries.filter((entry) => entry.activeUnresolved).length;
  const reasons: string[] = [];
  if (activeUnresolved >= ACTIVE_UNRESOLVED_LIMIT) reasons.push(`active unresolvedが上限（${ACTIVE_UNRESOLVED_LIMIT}件）に達しています`);
  const saturatedTopics = Object.entries(unresolvedByTopic)
    .filter(([, count]) => count >= TOPIC_UNRESOLVED_LIMIT)
    .map(([topic]) => topic)
    .sort();
  return { entries, activeUnresolved, unresolvedByTopic, saturatedTopics, backpressure: reasons.length > 0, reasons };
}
