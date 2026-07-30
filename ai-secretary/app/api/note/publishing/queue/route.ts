import { NextRequest, NextResponse } from "next/server";
import {
  loadNoteQueue,
  loadResearchSettings,
  loadSocialDrafts,
  saveNoteQueue,
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
