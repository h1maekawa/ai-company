import { createHash } from "node:crypto";
import type { SocialDraft, SocialDraftStatus } from "../research/types";
import { CLEANUP_CANDIDATE_AFTER_MS } from "../automation/queueLifecycle";

/**
 * 旧Research由来のX下書きを一度だけ整理するためのメンテナンス（人間の明示承認が前提）。
 *
 * - 対象は SocialDraft[]（social-drafts.md）の中身だけ。Research / Performance / Publishing History には触れない。
 * - 未公開・未予約の draft / approved / failed / discarded だけを削除候補にする。
 * - queued / scheduled / published は保持する。Buffer予約のキャンセルもしない。
 * - status が削除対象でも、Buffer・Xとの紐付け（bufferPostId / xPostId / scheduledAt）が残るものは保持する。
 *   ローカルだけ消すと外部予約・公開実績との対応が失われるため、推測で削除しない。
 */
export const CLEANUP_TARGET_STATUSES: readonly SocialDraftStatus[] = ["draft", "approved", "failed", "discarded"];
export const ALL_DRAFT_STATUSES: readonly SocialDraftStatus[] = ["draft", "approved", "queued", "scheduled", "published", "failed", "discarded"];

export type DraftCleanupCounts = Record<SocialDraftStatus, number> & { total: number; withBufferPostId: number };

export type DraftCleanupReferenceIndex = {
  currentPlanDraftIds?: readonly string[];
  historyDraftIds?: readonly string[];
  performanceContentIds?: readonly string[];
  revenueContentIds?: readonly string[];
  knowledgeReferencedDraftIds?: readonly string[];
};

export type CleanupProtectionReason =
  | "published_status" | "scheduled_status" | "buffer_link" | "x_link" | "external_url"
  | "current_plan" | "performance_reference" | "publishing_history_reference"
  | "revenue_reference" | "knowledge_reference" | "human_keep" | "not_old_enough" | "not_cleanup_status";

export type DraftCleanupPlan = {
  before: DraftCleanupCounts;
  after: DraftCleanupCounts;
  /** 削除対象のidとstatusだけ。本文は含めない */
  targets: Array<{ id: string; status: SocialDraftStatus; reason: "duplicate" | "superseded" | "testArtifact" | "legacy_review_only" | "stale_over_7d" | "qa_blocked_over_7d" }>;
  retained: Array<{ id: string; status: SocialDraftStatus; reasons: CleanupProtectionReason[] }>;
  /** dry-run と本実行の間に下書きが変わっていないことを確かめるための指紋 */
  planId: string;
};

export function countDrafts(drafts: SocialDraft[]): DraftCleanupCounts {
  const counts = Object.fromEntries(ALL_DRAFT_STATUSES.map((status) => [status, 0])) as Record<SocialDraftStatus, number>;
  for (const draft of drafts) counts[draft.status] = (counts[draft.status] ?? 0) + 1;
  return { ...counts, total: drafts.length, withBufferPostId: drafts.filter((draft) => Boolean(draft.bufferPostId)).length };
}

const set = (values: readonly string[] | undefined) => new Set(values ?? []);

export function planDraftCleanup(
  drafts: SocialDraft[],
  options: { now?: Date; references?: DraftCleanupReferenceIndex } = {}
): DraftCleanupPlan {
  const now = options.now ?? new Date();
  const refs = options.references ?? {};
  const currentPlan = set(refs.currentPlanDraftIds);
  const history = set(refs.historyDraftIds);
  const performance = set(refs.performanceContentIds);
  const revenue = set(refs.revenueContentIds);
  const knowledge = set(refs.knowledgeReferencedDraftIds);
  const targets: DraftCleanupPlan["targets"] = [];
  const retained: DraftCleanupPlan["retained"] = [];
  for (const draft of drafts) {
    const reasons: CleanupProtectionReason[] = [];
    if (draft.status === "published") reasons.push("published_status");
    if (draft.status === "queued" || draft.status === "scheduled" || draft.scheduledAt) reasons.push("scheduled_status");
    if (draft.bufferPostId) reasons.push("buffer_link");
    if (draft.xPostId) reasons.push("x_link");
    if (draft.bufferExternalLink || draft.urls.length > 0) reasons.push("external_url");
    if (currentPlan.has(draft.id)) reasons.push("current_plan");
    if (performance.has(draft.id)) reasons.push("performance_reference");
    if (history.has(draft.id)) reasons.push("publishing_history_reference");
    if (revenue.has(draft.id)) reasons.push("revenue_reference");
    if (knowledge.has(draft.id) || (draft.sourceKnowledgeIds?.length ?? 0) > 0) reasons.push("knowledge_reference");
    if (draft.humanKeep) reasons.push("human_keep");
    if (!CLEANUP_TARGET_STATUSES.includes(draft.status)) reasons.push("not_cleanup_status");

    const timestamp = Date.parse(draft.updatedAt || draft.createdAt);
    const age = Number.isFinite(timestamp) ? Math.max(0, now.getTime() - timestamp) : 0;
    const explicit = draft.cleanupDisposition;
    if (!explicit && age <= CLEANUP_CANDIDATE_AFTER_MS) reasons.push("not_old_enough");
    if (reasons.length) {
      retained.push({ id: draft.id, status: draft.status, reasons: [...new Set(reasons)] });
      continue;
    }
    const reason = explicit ?? (draft.status === "failed" || Boolean(draft.failureReason) ? "qa_blocked_over_7d" : "stale_over_7d");
    targets.push({ id: draft.id, status: draft.status, reason });
  }
  const targetIds = new Set(targets.map((item) => item.id));
  const remaining = drafts.filter((draft) => !targetIds.has(draft.id));
  const planId = createHash("sha256").update(targets.map((item) => `${item.id}:${item.status}`).sort().join("|")).digest("hex").slice(0, 16);
  return { before: countDrafts(drafts), after: countDrafts(remaining), targets, retained, planId };
}

/** 計画に含まれるidだけを除く。既存配列は変更しない。 */
export function applyDraftCleanup(drafts: SocialDraft[], plan: DraftCleanupPlan): SocialDraft[] {
  const targetIds = new Set(plan.targets.map((item) => item.id));
  return drafts.filter((draft) => !targetIds.has(draft.id));
}
