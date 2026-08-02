import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import {
  loadNoteQueue,
  loadSocialDrafts,
  saveNoteQueue,
  saveSocialDrafts,
} from "@/app/lib/note/research/store";
import type { NoteArticleDraft, SocialDraft } from "@/app/lib/note/research/types";

export const dynamic = "force-dynamic";

/**
 * 完成済みの本人原稿を、書き換えずに下書きへ登録する。
 * 外部公開や投稿ジョブの作成は行わない。
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const body = (await req.json()) as {
      title?: string;
      article?: string;
      xPosts?: string[];
      genreId?: string;
      needsDisclosure?: boolean;
    };
    const title = body.title?.trim() ?? "";
    const articleText = body.article?.trim() ?? "";
    const xPosts = (body.xPosts ?? []).map((text) => text.trim()).filter(Boolean).slice(0, 10);
    if (!title || !articleText) {
      return NextResponse.json({ error: "タイトルとnote本文が必要です" }, { status: 400 });
    }
    if (title.length > 120 || articleText.length > 100_000) {
      return NextResponse.json({ error: "タイトルまたは本文が長すぎます" }, { status: 422 });
    }
    if (xPosts.some((text) => Array.from(text).length > 280)) {
      return NextResponse.json({ error: "X投稿案は1件280文字以内にしてください" }, { status: 422 });
    }
    if (articleText.includes("[note記事URL]")) {
      return NextResponse.json(
        { error: "本文内の [note記事URL] を削除または実際のURLへ置き換えてください" },
        { status: 422 }
      );
    }

    const now = new Date().toISOString();
    const [queue, existingSocialDrafts] = await Promise.all([
      loadNoteQueue(),
      loadSocialDrafts(),
    ]);
    const article: NoteArticleDraft = {
      id: `manual_note_${randomUUID()}`,
      title,
      articleType: body.needsDisclosure ? "affiliate" : "free",
      freeSection: articleText,
      tags: [],
      affiliateIds: [],
      needsDisclosure: Boolean(body.needsDisclosure),
      sourceResearchItemIds: [],
      sourceExperienceIds: [],
      status: "draft",
      createdAt: now,
      updatedAt: now,
    };
    const drafts: SocialDraft[] = xPosts.map((text) => ({
      id: `manual_x_${randomUUID()}`,
      xAccountId: "unassigned",
      purpose: "note-bridge",
      genreId: body.genreId?.trim() || "reading",
      text,
      urls: [],
      needsDisclosure: /^\s*(?:【PR】|PR[:：]?)/i.test(text),
      status: "draft",
      createdAt: now,
      updatedAt: now,
    }));

    await Promise.all([
      saveNoteQueue({ ...queue, articles: [article, ...queue.articles] }),
      saveSocialDrafts([...drafts, ...existingSocialDrafts]),
    ]);
    return NextResponse.json({
      ok: true,
      articleId: article.id,
      xDraftIds: drafts.map((draft) => draft.id),
      message: "noteとXの下書きへ保存しました。外部公開はしていません。",
    });
  } catch (error) {
    console.error("[api/note/content/import] 失敗:", error);
    return NextResponse.json({ error: "下書きの保存に失敗しました" }, { status: 500 });
  }
}
