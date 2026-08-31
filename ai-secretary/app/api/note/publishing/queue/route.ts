import { NextRequest, NextResponse } from "next/server";
import {
  loadNoteQueue,
  loadResearchSettings,
  loadSocialDrafts,
  saveNoteQueue,
  saveSocialDrafts,
} from "@/app/lib/note/research/store";

export const dynamic = "force-dynamic";

/** GET — X下書き / note記事 / 投稿ジョブの現在地 */
export async function GET(): Promise<NextResponse> {
  try {
    const [queue, drafts, settings] = await Promise.all([
      loadNoteQueue(),
      loadSocialDrafts(),
      loadResearchSettings(),
    ]);
    return NextResponse.json({
      ...queue,
      socialDrafts: drafts,
      flags: settings.flags,
    });
  } catch (error) {
    console.error("[api/note/publishing/queue] GET失敗:", error);
    return NextResponse.json({ error: "キューの取得に失敗しました" }, { status: 500 });
  }
}

/**
 * PUT — note記事の更新（価格・有料境界・承認）。
 * 価格と公開は必ず人が決める。ここではAIに触らせない。
 */
export async function PUT(req: NextRequest): Promise<NextResponse> {
  try {
    const body = await req.json();
    if (!body.articleId) {
      return NextResponse.json({ error: "articleId が必要です" }, { status: 400 });
    }

    const queue = await loadNoteQueue();
    const article = queue.articles.find((a) => a.id === body.articleId);
    if (!article) {
      return NextResponse.json({ error: "その記事が見つかりません" }, { status: 404 });
    }

    const patch = body.patch ?? {};
    const next = {
      ...article,
      ...patch,
      id: article.id,
      updatedAt: new Date().toISOString(),
    };

    // 有料記事は価格と境界が揃うまで approved にできない
    if (next.articleType === "paid" && next.status === "approved") {
      if (typeof next.price !== "number" || next.price <= 0) {
        return NextResponse.json(
          { error: "有料記事は価格を設定してから承認してください" },
          { status: 422 }
        );
      }
      if (!next.paywallAfterHeading) {
        return NextResponse.json(
          { error: "有料の境界（どの見出しから有料か）を設定してください" },
          { status: 422 }
        );
      }
    }

    const saved = await saveNoteQueue({
      ...queue,
      articles: queue.articles.map((a) => (a.id === article.id ? next : a)),
    });
    return NextResponse.json(saved);
  } catch (error) {
    console.error("[api/note/publishing/queue] PUT失敗:", error);
    return NextResponse.json({ error: "記事の更新に失敗しました" }, { status: 500 });
  }
}

/**
 * PATCH — X下書き(SocialDraft)の本文編集（本人編集Diff学習・要件P0.3）。
 * REVIEWモードで本人がAI下書きを修正した場合に originalText/editedByUser/editedAt を記録する。
 * originalTextは初回編集時のみ固定し、以後の再編集で上書きしない
 * （AI OriginalとUser Finalの両方を保持するため）。
 */
export async function PATCH(req: NextRequest): Promise<NextResponse> {
  try {
    const body = await req.json();
    if (!body.draftId || typeof body.text !== "string") {
      return NextResponse.json({ error: "draftId と text が必要です" }, { status: 400 });
    }
    const drafts = await loadSocialDrafts();
    const draft = drafts.find((d) => d.id === body.draftId);
    if (!draft) {
      return NextResponse.json({ error: "その下書きが見つかりません" }, { status: 404 });
    }

    const trimmed = body.text.trim();
    if (!trimmed || trimmed === draft.text) {
      return NextResponse.json({ socialDrafts: drafts });
    }

    const now = new Date().toISOString();
    const next = {
      ...draft,
      text: trimmed,
      originalText: draft.originalText ?? draft.text,
      editedByUser: true,
      editedAt: now,
      updatedAt: now,
    };
    const saved = await saveSocialDrafts(drafts.map((d) => (d.id === draft.id ? next : d)));
    return NextResponse.json({ socialDrafts: saved });
  } catch (error) {
    console.error("[api/note/publishing/queue] PATCH失敗:", error);
    return NextResponse.json({ error: "下書きの更新に失敗しました" }, { status: 500 });
  }
}
