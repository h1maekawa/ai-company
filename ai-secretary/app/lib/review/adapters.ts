/**
 * 既存の承認システム → 共通 ReviewItem への写像 — 要件2
 *
 * 保存先は移さない。各ストアはそのまま残し、ここは読み取り専用の写像に徹する。
 * 決定の書き戻しは decide.ts が、それぞれの元ストアに対して行う。
 */

import type { Learning } from "@/app/lib/content/learning/types";
import type {
  ExperienceEntry,
  NoteArticleDraft,
  SocialDraft,
  ViewpointLibraryEntry,
} from "@/app/lib/note/research/types";
import type { QaReport } from "@/app/lib/qa/types";
import { ReviewItem, phaseOf, reviewItemId } from "./types";

const excerptOf = (text: string, length = 140): string =>
  text.replace(/\s+/g, " ").trim().slice(0, length);

/* ─── X投稿 ──────────────────────────────────────── */

/** レビュー待ちのX下書きか（公開済み・破棄済みは対象外） */
export function isPendingXDraft(draft: SocialDraft): boolean {
  return !["published", "discarded", "queued", "scheduled"].includes(draft.status);
}

export function xDraftReason(draft: SocialDraft): string {
  if (draft.failureReason) return `安全チェック: ${draft.failureReason}`;
  if (draft.status === "failed") return "予約に失敗しました";
  if (draft.status === "approved") return "承認済み・未予約";
  return "承認待ち";
}

export function toReviewItem(draft: SocialDraft, qa: QaReport | null): ReviewItem {
  return {
    id: reviewItemId("x_draft", draft.id),
    kind: "x_draft",
    sourceId: draft.id,
    phase: phaseOf("x_draft"),
    title: excerptOf(draft.text ?? "", 40) || "（本文なし）",
    excerpt: excerptOf(draft.text ?? ""),
    editable: true,
    reason: xDraftReason(draft),
    updatedAt: draft.updatedAt ?? draft.createdAt ?? "",
    qa,
  };
}

/* ─── note記事 ───────────────────────────────────── */

export function isPendingNoteArticle(article: NoteArticleDraft): boolean {
  return !["published", "queued"].includes(article.status);
}

export function noteArticleReason(article: NoteArticleDraft): string {
  if (article.status === "failed") return "公開に失敗しました";
  if (article.status === "approved") return "承認済み・未公開";
  if (article.paidSection && !article.price) return "価格が未設定です";
  return "承認待ち";
}

export function noteArticleToReviewItem(
  article: NoteArticleDraft,
  qa: QaReport | null
): ReviewItem {
  return {
    id: reviewItemId("note_article", article.id),
    kind: "note_article",
    sourceId: article.id,
    phase: phaseOf("note_article"),
    title: article.title || "（無題）",
    excerpt: excerptOf(article.freeSection ?? ""),
    editable: true,
    reason: noteArticleReason(article),
    updatedAt: article.updatedAt ?? article.createdAt ?? "",
    qa,
  };
}

/* ─── 視点・体験・学び（リサーチ工程） ───────────── */

export function viewpointToReviewItem(entry: ViewpointLibraryEntry): ReviewItem {
  return {
    id: reviewItemId("viewpoint", entry.id),
    kind: "viewpoint",
    sourceId: entry.id,
    phase: phaseOf("viewpoint"),
    title: entry.title || entry.topic,
    excerpt: excerptOf(entry.opinion),
    // 視点・体験・学びは構造化データなので、一覧からの本文編集は用意しない
    editable: false,
    reason: "本人確認待ち（この視点を再利用してよいか）",
    updatedAt: entry.updatedAt ?? entry.createdAt ?? "",
    qa: null,
  };
}

export function experienceToReviewItem(entry: ExperienceEntry): ReviewItem {
  return {
    id: reviewItemId("experience", entry.id),
    kind: "experience",
    sourceId: entry.id,
    phase: phaseOf("experience"),
    title: entry.title,
    excerpt: excerptOf(entry.summary || entry.whatHappened),
    editable: false,
    reason: "本人確認待ち（この体験を記事に使ってよいか）",
    updatedAt: entry.updatedAt ?? entry.createdAt ?? "",
    qa: null,
  };
}

export function learningToReviewItem(learning: Learning): ReviewItem {
  return {
    id: reviewItemId("learning", learning.id),
    kind: "learning",
    sourceId: learning.id,
    phase: phaseOf("learning"),
    title: excerptOf(learning.observation, 40),
    excerpt: excerptOf(`${learning.observation} → ${learning.interpretation}`),
    editable: false,
    reason: "この学びを次の方針に反映してよいか",
    updatedAt: learning.createdAt ?? "",
    qa: null,
  };
}

/** candidate 状態のものだけがレビュー対象 */
export const isCandidate = (entry: { status?: string }): boolean =>
  (entry.status ?? "candidate") === "candidate";
