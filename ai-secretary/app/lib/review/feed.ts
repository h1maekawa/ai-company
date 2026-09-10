/**
 * レビュー待ち一覧の組み立て — 要件2
 *
 * 5つの承認システムを横断して1つの配列にする。
 * X投稿とnote記事にはQAゲート（要件9）の結果を付ける。
 */

import { loadLearnings } from "@/app/lib/content/learning/store";
import { loadBrand } from "@/app/lib/note/store";
import {
  loadExperiences,
  loadNoteQueue,
  loadResearchInbox,
  loadSocialDrafts,
  loadViewpoints,
} from "@/app/lib/note/research/store";
import { runNoteArticleQa, runXDraftQa } from "@/app/lib/qa/runner";
import {
  runExperienceQa,
  runLearningQa,
  runViewpointQa,
} from "@/app/lib/qa/researchChecks";
import type { QaReport } from "@/app/lib/qa/types";
import {
  experienceToReviewItem,
  isCandidate,
  isPendingNoteArticle,
  isPendingXDraft,
  learningToReviewItem,
  noteArticleToReviewItem,
  toReviewItem,
  viewpointToReviewItem,
} from "./adapters";
import { REVIEW_PHASE_ORDER, ReviewItem, ReviewPhase } from "./types";

export type ReviewFeed = {
  items: ReviewItem[];
  /** 工程ごとの件数。要件7のステップ表示が使う */
  byPhase: Record<ReviewPhase, number>;
  /** 自動テストが通っていない件数（要件10の自動承認対象外） */
  blockedByQa: number;
  loadedAt: string;
};

/** QAの失敗で一覧全体を落とさない。落ちたものは qa: null（未検証）として出す */
async function safeQa(run: () => Promise<QaReport> | QaReport): Promise<QaReport | null> {
  try {
    return await run();
  } catch (error) {
    console.error("[review/feed] QAゲートの実行に失敗:", error);
    return null;
  }
}

export async function loadReviewFeed(): Promise<ReviewFeed> {
  const [drafts, queue, viewpoints, experiences, learnings, brandFile, researchItems] =
    await Promise.all([
      loadSocialDrafts(),
      loadNoteQueue(),
      loadViewpoints(),
      loadExperiences(),
      loadLearnings(),
      loadBrand(),
      loadResearchInbox(),
    ]);

  const xItems = await Promise.all(
    drafts.filter(isPendingXDraft).map(async (draft) =>
      toReviewItem(
        draft,
        await safeQa(() =>
          runXDraftQa({
            draft,
            brand: brandFile.brand,
            experiences,
            researchItems,
            // 一覧表示のたびに外部へ出ていかない。ドライランは承認直前に実行する
            includeDryRun: false,
          })
        )
      )
    )
  );

  const noteItems = await Promise.all(
    queue.articles.filter(isPendingNoteArticle).map(async (article) =>
      noteArticleToReviewItem(
        article,
        await safeQa(() => runNoteArticleQa({ article, researchItems }))
      )
    )
  );

  const items: ReviewItem[] = [
    ...xItems,
    ...noteItems,
    // リサーチ工程も検査対象にする。自動承認（要件10）は
    // 「テストを通過した」ことを条件にしており、検査が無いものは通せないため
    ...viewpoints
      .filter(isCandidate)
      .map((v) => ({ ...viewpointToReviewItem(v), qa: runViewpointQa(v) })),
    ...experiences
      .filter(isCandidate)
      .map((e) => ({ ...experienceToReviewItem(e), qa: runExperienceQa(e) })),
    ...learnings
      .filter(isCandidate)
      .map((l) => ({ ...learningToReviewItem(l), qa: runLearningQa(l) })),
  ];

  // 新しいものを上に。工程順ではなく時系列にするのは、
  // 「放置されている古いもの」を見つけやすくするため（要件7の停滞強調と対になる）
  items.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));

  const byPhase = REVIEW_PHASE_ORDER.reduce(
    (acc, phase) => ({ ...acc, [phase]: items.filter((i) => i.phase === phase).length }),
    {} as Record<ReviewPhase, number>
  );

  return {
    items,
    byPhase,
    blockedByQa: items.filter((i) => i.qa && !i.qa.passed).length,
    loadedAt: new Date().toISOString(),
  };
}
