/**
 * 自動承認の実行 — 要件10
 *
 * 「自動承認」に設定された工程のうち、自動テストを全て通過した項目だけを
 * 人の操作なしで承認する。通過していないものは何もせず、
 * 人間承認へフォールバックする（承認フィードに残ったままになる）。
 *
 * 監査ログ:
 *   自動承認したものも必ず ReviewFeedback に decidedBy: "auto" で記録する。
 *   承認フィードに「自動承認済み」として残り、後から人が確認・差し戻せる。
 */

import { loadResearchSettings } from "@/app/lib/note/research/store";
import { canAutoApprove, normalizeApprovalPolicy } from "./approvalPolicy";
import { decideReviewItem } from "./decide";
import { loadReviewFeed } from "./feed";
import type { ReviewItem } from "./types";

export type AutoApprovalResult = {
  /** 判定した件数 */
  evaluated: number;
  /** 自動承認した件数 */
  approved: number;
  /** 人間承認へ回した件数と、その理由 */
  heldForHuman: { itemId: string; reason: string }[];
  /** 承認処理自体に失敗した件数 */
  failed: { itemId: string; error: string }[];
  ranAt: string;
};

export async function runAutoApproval(): Promise<AutoApprovalResult> {
  const [settings, feed] = await Promise.all([loadResearchSettings(), loadReviewFeed()]);
  const policy = normalizeApprovalPolicy(settings.approvalPolicy);

  const approved: ReviewItem[] = [];
  const heldForHuman: { itemId: string; reason: string }[] = [];
  const failed: { itemId: string; error: string }[] = [];

  for (const item of feed.items) {
    const verdict = canAutoApprove(item, policy);
    if (!verdict.approve) {
      heldForHuman.push({ itemId: item.id, reason: verdict.reason });
      continue;
    }

    const result = await decideReviewItem({
      itemId: item.id,
      decision: "approve",
      decidedBy: "auto",
    });

    if (result.ok) approved.push(item);
    else failed.push({ itemId: item.id, error: result.error });
  }

  return {
    evaluated: feed.items.length,
    approved: approved.length,
    heldForHuman,
    failed,
    ranAt: new Date().toISOString(),
  };
}
