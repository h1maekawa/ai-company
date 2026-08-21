import { NextRequest, NextResponse } from "next/server";
import { PreviousContentProvider } from "@/app/lib/content/core/providers/previousContent";
import { createArticleSession } from "@/app/lib/content/note-studio/types";
import { saveSession } from "@/app/lib/content/note-studio/store";

export const dynamic = "force-dynamic";

/**
 * POST { publishedContentId }
 * 反応の良かったXから note記事にする（X → Note）。
 * PublishedContent(X) → Material化 → 新しいArticleSession（AI Interviewから開始）を作る。
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const body = await req.json();
    const publishedContentId = String(body.publishedContentId ?? "");
    if (!publishedContentId) {
      return NextResponse.json({ error: "publishedContentIdを指定してください" }, { status: 400 });
    }

    const material = await PreviousContentProvider.importMaterial(`published:${publishedContentId}`);
    const session = createArticleSession({ title: material.title, materialIds: [material.id] });
    await saveSession(session);

    return NextResponse.json({ material, session });
  } catch (error) {
    console.error("[api/content/note/from-x] POST失敗:", error);
    return NextResponse.json({ error: "noteセッションの作成に失敗しました" }, { status: 500 });
  }
}
