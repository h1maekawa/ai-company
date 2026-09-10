/**
 * レビューの決定を元ストアへ書き戻す — 要件2
 *
 * 「承認 / 差し戻し / 編集して承認」のワンクリック操作の実体。
 * 保存先は種別ごとに違うままなので、ここで振り分ける。
 *
 * 必ず守ること:
 *   - 承認は既存の approve* 関数だけが行う（status を直接書き換えない）
 *   - どの決定も ReviewFeedback として記録する（自動承認も含む・要件10の監査ログ）
 *   - 自動テスト（要件9）が通っていないものは承認させない
 */

import {
  approveExperience,
  approveViewpoint,
  rejectExperience,
  rejectViewpoint,
} from "@/app/lib/content/core/approval";
import { approveLearning, rejectLearning } from "@/app/lib/content/learning/types";
import { loadLearnings, saveLearnings } from "@/app/lib/content/learning/store";
import {
  loadExperiences,
  loadNoteQueue,
  loadSocialDrafts,
  loadViewpoints,
  saveExperiences,
  saveNoteQueue,
  saveSocialDrafts,
  saveViewpoints,
} from "@/app/lib/note/research/store";
import { appendReviewFeedback } from "./feedbackStore";
import { ReviewDecision, ReviewFeedback, ReviewItemKind, parseReviewItemId, phaseOf } from "./types";

export type DecideInput = {
  /** "<kind>:<id>" */
  itemId: string;
  decision: ReviewDecision;
  /** 差し戻し理由。reject では必須 */
  reason?: string;
  /** edit_approve のときの修正後本文 */
  editedText?: string;
  /** 自動承認（要件10）から呼ばれた場合は "auto" */
  decidedBy?: "human" | "auto";
};

export type DecideResult =
  | { ok: true; itemId: string; decision: ReviewDecision }
  | { ok: false; error: string; status: number };

const fail = (status: number, error: string): DecideResult => ({ ok: false, error, status });

/* ─── 種別ごとの書き戻し ─────────────────────────── */

async function decideXDraft(
  sourceId: string,
  input: DecideInput
): Promise<{ error?: string; status?: number; originalText?: string; editedText?: string }> {
  const drafts = await loadSocialDrafts();
  const draft = drafts.find((d) => d.id === sourceId);
  if (!draft) return { error: "その下書きが見つかりません", status: 404 };

  const now = new Date().toISOString();

  if (input.decision === "reject") {
    await saveSocialDrafts(
      drafts.map((d) =>
        d.id === sourceId
          ? { ...d, status: "discarded" as const, failureReason: input.reason, updatedAt: now }
          : d
      )
    );
    return {};
  }

  // 編集して承認: AI原文を originalText に固定する（初回編集時のみ・要件P0.3の既存仕様に合わせる）
  const edited = input.decision === "edit_approve" ? input.editedText?.trim() : undefined;
  if (input.decision === "edit_approve" && !edited) {
    return { error: "編集後の本文が空です", status: 400 };
  }

  await saveSocialDrafts(
    drafts.map((d) =>
      d.id === sourceId
        ? {
            ...d,
            ...(edited && edited !== d.text
              ? {
                  text: edited,
                  originalText: d.originalText ?? d.text,
                  editedByUser: true,
                  editedAt: now,
                }
              : {}),
            status: "approved" as const,
            updatedAt: now,
          }
        : d
    )
  );
  return { originalText: draft.originalText ?? draft.text, editedText: edited };
}

async function decideNoteArticle(
  sourceId: string,
  input: DecideInput
): Promise<{ error?: string; status?: number }> {
  const queue = await loadNoteQueue();
  const article = queue.articles.find((a) => a.id === sourceId);
  if (!article) return { error: "その記事が見つかりません", status: 404 };

  const now = new Date().toISOString();

  if (input.decision === "reject") {
    await saveNoteQueue({
      ...queue,
      articles: queue.articles.map((a) =>
        a.id === sourceId ? { ...a, status: "draft" as const, updatedAt: now } : a
      ),
    });
    return {};
  }

  // 有料記事の価格・境界は人が決める。ここでの承認でも既存の条件を外さない
  if (article.paidSection?.trim()) {
    if (typeof article.price !== "number" || article.price <= 0) {
      return { error: "有料記事は価格を設定してから承認してください", status: 422 };
    }
    if (!article.paywallAfterHeading) {
      return { error: "有料の境界（どの見出しから有料か）を設定してください", status: 422 };
    }
  }

  const edited = input.decision === "edit_approve" ? input.editedText?.trim() : undefined;

  await saveNoteQueue({
    ...queue,
    articles: queue.articles.map((a) =>
      a.id === sourceId
        ? {
            ...a,
            ...(edited ? { freeSection: edited } : {}),
            status: "approved" as const,
            updatedAt: now,
          }
        : a
    ),
  });
  return {};
}

async function decideViewpoint(
  sourceId: string,
  input: DecideInput
): Promise<{ error?: string; status?: number }> {
  const entries = await loadViewpoints();
  const entry = entries.find((e) => e.id === sourceId);
  if (!entry) return { error: "その視点が見つかりません", status: 404 };

  const next = input.decision === "reject" ? rejectViewpoint(entry) : approveViewpoint(entry);
  await saveViewpoints(entries.map((e) => (e.id === sourceId ? next : e)));
  return {};
}

async function decideExperience(
  sourceId: string,
  input: DecideInput
): Promise<{ error?: string; status?: number }> {
  const entries = await loadExperiences();
  const entry = entries.find((e) => e.id === sourceId);
  if (!entry) return { error: "その体験が見つかりません", status: 404 };

  const next = input.decision === "reject" ? rejectExperience(entry) : approveExperience(entry);
  await saveExperiences(entries.map((e) => (e.id === sourceId ? next : e)));
  return {};
}

async function decideLearning(
  sourceId: string,
  input: DecideInput
): Promise<{ error?: string; status?: number }> {
  const learnings = await loadLearnings();
  const learning = learnings.find((l) => l.id === sourceId);
  if (!learning) return { error: "その学びが見つかりません", status: 404 };

  const next = input.decision === "reject" ? rejectLearning(learning) : approveLearning(learning);
  await saveLearnings(learnings.map((l) => (l.id === sourceId ? next : l)));
  return {};
}

/* ─── 入口 ───────────────────────────────────────── */

export async function decideReviewItem(input: DecideInput): Promise<DecideResult> {
  const parsed = parseReviewItemId(input.itemId);
  if (!parsed) return fail(400, "itemId の形式が不正です");

  if (input.decision === "reject" && !input.reason?.trim()) {
    // 理由の無い差し戻しはエージェントへのフィードバックにならない
    return fail(400, "差し戻しには理由が必要です");
  }

  const { kind, sourceId } = parsed;
  const handlers: Record<
    ReviewItemKind,
    (id: string, i: DecideInput) => Promise<{
      error?: string;
      status?: number;
      originalText?: string;
      editedText?: string;
    }>
  > = {
    x_draft: decideXDraft,
    note_article: decideNoteArticle,
    viewpoint: decideViewpoint,
    experience: decideExperience,
    learning: decideLearning,
  };

  const result = await handlers[kind](sourceId, input);
  if (result.error) return fail(result.status ?? 500, result.error);

  const feedback: ReviewFeedback = {
    id: `rf${Date.now().toString(36)}`,
    itemId: input.itemId,
    kind,
    phase: phaseOf(kind),
    decision: input.decision,
    reason: input.reason?.trim() ?? "",
    originalText: result.originalText,
    editedText: result.editedText,
    decidedBy: input.decidedBy ?? "human",
    decidedAt: new Date().toISOString(),
  };
  await appendReviewFeedback(feedback);

  return { ok: true, itemId: input.itemId, decision: input.decision };
}
