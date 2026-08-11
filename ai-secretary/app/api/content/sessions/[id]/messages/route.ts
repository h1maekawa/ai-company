import { NextRequest, NextResponse } from "next/server";
import { appendMessage } from "@/app/lib/content/note-studio/types";
import { nextInterviewQuestion } from "@/app/lib/content/note-studio/interview";
import { loadSession, saveSession } from "@/app/lib/content/note-studio/store";
import { loadContentCore } from "@/app/lib/content/core/store";

export const dynamic = "force-dynamic";

/**
 * POST { text }
 * 本人発言をメッセージへ追加し（Chat autosave）、AIが1〜2問だけ質問を返す。
 * AI一括記事生成はしない。
 */
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
): Promise<NextResponse> {
  try {
    const session = await loadSession(params.id);
    if (!session) return NextResponse.json({ error: "ArticleSessionが見つかりません" }, { status: 404 });

    const body = await req.json();
    const text = String(body.text ?? "").trim();
    if (!text) return NextResponse.json({ error: "textを入力してください" }, { status: 400 });

    let next = appendMessage(session, "user", text);
    await saveSession(next);

    if (body.skipAiReply) {
      return NextResponse.json({ session: next });
    }

    const { materials } = await loadContentCore();
    const summaries = materials
      .filter((m) => session.materialIds.includes(m.id))
      .map((m) => m.summary ?? m.rawContent.slice(0, 200));

    try {
      const question = await nextInterviewQuestion(next, summaries);
      if (question) {
        next = appendMessage(next, "assistant", question);
        await saveSession(next);
      }
    } catch (aiError) {
      console.error("[api/content/sessions/:id/messages] AI応答に失敗（本人発言は保存済み）:", aiError);
    }

    return NextResponse.json({ session: next });
  } catch (error) {
    console.error("[api/content/sessions/:id/messages] POST失敗:", error);
    return NextResponse.json({ error: "メッセージの送信に失敗しました" }, { status: 500 });
  }
}
