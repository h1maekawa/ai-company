import { createHash } from "node:crypto";
import type { SocialDraft, SocialDraftStatus } from "../research/types";

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

export type DraftCleanupPlan = {
  before: DraftCleanupCounts;
  after: DraftCleanupCounts;
  /** 削除対象のidとstatusだけ。本文は含めない */
  targets: Array<{ id: string; status: SocialDraftStatus }>;
  /** 対象statusだが外部紐付けがあるため保持したもの */
  retainedLinked: Array<{ id: string; status: SocialDraftStatus; reason: "bufferPostId" | "xPostId" | "scheduledAt" }>;
  /** dry-run と本実行の間に下書きが変わっていないことを確かめるための指紋 */
  planId: string;
};

export function countDrafts(drafts: SocialDraft[]): DraftCleanupCounts {
  const counts = Object.fromEntries(ALL_DRAFT_STATUSES.map((status) => [status, 0])) as Record<SocialDraftStatus, number>;
  for (const draft of drafts) counts[draft.status] = (counts[draft.status] ?? 0) + 1;
  return { ...counts, total: drafts.length, withBufferPostId: drafts.filter((draft) => Boolean(draft.bufferPostId)).length };
}

function externalLink(draft: SocialDraft): "bufferPostId" | "xPostId" | "scheduledAt" | null {
  if (draft.bufferPostId) return "bufferPostId";
  if (draft.xPostId) return "xPostId";
  if (draft.scheduledAt) return "scheduledAt";
  return null;
}

export function planDraftCleanup(drafts: SocialDraft[]): DraftCleanupPlan {
  const targets: DraftCleanupPlan["targets"] = [];
  const retainedLinked: DraftCleanupPlan["retainedLinked"] = [];
  for (const draft of drafts) {
    if (!CLEANUP_TARGET_STATUSES.includes(draft.status)) continue;
    const link = externalLink(draft);
    if (link) retainedLinked.push({ id: draft.id, status: draft.status, reason: link });
    else targets.push({ id: draft.id, status: draft.status });
  }
  const targetIds = new Set(targets.map((item) => item.id));
  const remaining = drafts.filter((draft) => !targetIds.has(draft.id));
  const planId = createHash("sha256").update(targets.map((item) => `${item.id}:${item.status}`).sort().join("|")).digest("hex").slice(0, 16);
  return { before: countDrafts(drafts), after: countDrafts(remaining), targets, retainedLinked, planId };
}

/** 計画に含まれるidだけを除く。既存配列は変更しない。 */
export function applyDraftCleanup(drafts: SocialDraft[], plan: DraftCleanupPlan): SocialDraft[] {
  const targetIds = new Set(plan.targets.map((item) => item.id));
  return drafts.filter((draft) => !targetIds.has(draft.id));
}
