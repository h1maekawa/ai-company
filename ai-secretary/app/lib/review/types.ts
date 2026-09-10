/**
 * 承認フィードの共通モデル — 要件2「承認フィードの一元化」
 *
 * 現状、承認は5つの場所に分散している:
 *   1. SocialDraft（X投稿）          … status: draft/approved/...
 *   2. NoteArticleDraft（note記事）  … status: draft/approved/...
 *   3. ViewpointLibraryEntry（視点） … candidate/approved/rejected
 *   4. ExperienceEntry（体験）       … candidate/approved/rejected
 *   5. Learning（学び）              … candidate/approved/rejected
 *
 * これらを1つの「レビュー待ち一覧」に集約する。
 *
 * 設計方針: 保存先は移さない。
 *   既存の各ストアはそのまま残し、ここは読み取りと決定の入口だけを統一する。
 *   データ移行を伴う統合は、途中で失敗したときに承認履歴を失うリスクが大きいため。
 *   各種別に対応する Adapter が、共通の ReviewItem へ写像して返す。
 */

import type { QaReport } from "@/app/lib/qa/types";

export type ReviewItemKind =
  | "x_draft"
  | "note_article"
  | "viewpoint"
  | "experience"
  | "learning";

export const REVIEW_KIND_LABELS: Record<ReviewItemKind, string> = {
  x_draft: "X投稿",
  note_article: "note記事",
  viewpoint: "視点",
  experience: "体験",
  learning: "学び",
};

/**
 * 工程。要件7のステップ表示と、要件10のフェーズ別承認設定が同じ語彙を使う。
 * 「リサーチ→執筆→SEO→投稿」に対応する。
 */
export type ReviewPhase = "research" | "writing" | "seo" | "publish";

export const REVIEW_PHASE_LABELS: Record<ReviewPhase, string> = {
  research: "リサーチ",
  writing: "執筆",
  seo: "SEO最適化",
  publish: "投稿",
};

/** 工程の並び。ステップ表示の矢印順序はこれを正とする */
export const REVIEW_PHASE_ORDER: ReviewPhase[] = ["research", "writing", "seo", "publish"];

export type ReviewDecision = "approve" | "reject" | "edit_approve";

/** レビュー待ちの1件。UIはこの形だけを知っていればよい */
export type ReviewItem = {
  /** "<kind>:<元のID>" 形式。種別をまたいで一意にする */
  id: string;
  kind: ReviewItemKind;
  /** 元のストアでのID */
  sourceId: string;
  phase: ReviewPhase;
  title: string;
  /** 一覧に出す抜粋 */
  excerpt: string;
  /** 編集して承認できるか（本文を持つものだけ true） */
  editable: boolean;
  /** なぜレビュー待ちなのか */
  reason: string;
  updatedAt: string;
  /** 自動テストの結果（要件9）。実行対象外なら null */
  qa: QaReport | null;
  /** 自動承認で通過したものか（要件10の監査ログ） */
  autoApproved?: boolean;
};

/** 差し戻しの記録。エージェントへのフィードバック（要件4と連携）に使う */
export type ReviewFeedback = {
  id: string;
  itemId: string;
  kind: ReviewItemKind;
  phase: ReviewPhase;
  decision: ReviewDecision;
  /** 差し戻し理由。approve では空 */
  reason: string;
  /** 編集して承認した場合、AI原文と人の修正後 */
  originalText?: string;
  editedText?: string;
  /** 自動承認か人の判断か */
  decidedBy: "human" | "auto";
  decidedAt: string;
};

export function reviewItemId(kind: ReviewItemKind, sourceId: string): string {
  return `${kind}:${sourceId}`;
}

export function parseReviewItemId(
  id: string
): { kind: ReviewItemKind; sourceId: string } | null {
  const index = id.indexOf(":");
  if (index <= 0) return null;
  const kind = id.slice(0, index) as ReviewItemKind;
  if (!(kind in REVIEW_KIND_LABELS)) return null;
  const sourceId = id.slice(index + 1);
  return sourceId ? { kind, sourceId } : null;
}

/** 種別 → 工程。要件10のフェーズ別承認設定がこの対応を使う */
export function phaseOf(kind: ReviewItemKind): ReviewPhase {
  switch (kind) {
    case "viewpoint":
    case "experience":
    case "learning":
      return "research";
    case "note_article":
      return "writing";
    case "x_draft":
      return "publish";
  }
}
