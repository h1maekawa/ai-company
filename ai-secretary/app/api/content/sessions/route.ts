import { NextRequest, NextResponse } from "next/server";
import { createArticleSession } from "@/app/lib/content/note-studio/types";
import { loadSessions, saveSession } from "@/app/lib/content/note-studio/store";

export const dynamic = "force-dynamic";

/** GET: ArticleSession一覧（Timeboxに一切依存しない） */
export async function GET(): Promise<NextResponse> {
  try {
    return NextResponse.json({ sessions: await loadSessions() });
  } catch (error) {
    console.error("[api/content/sessions] GET失敗:", error);
    return NextResponse.json({ error: "ArticleSessionの取得に失敗しました" }, { status: 500 });
  }
}

/** POST { title, materialIds? }: 新規ArticleSession作成。stageは常にMATERIALから始まる */
export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const body = await req.json();
    const title = String(body.title ?? "").trim();
    if (!title) return NextResponse.json({ error: "titleを入力してください" }, { status: 400 });

    const session = createArticleSession({ title, materialIds: body.materialIds ?? [] });
    await saveSession(session);
    return NextResponse.json({ session });
  } catch (error) {
    console.error("[api/content/sessions] POST失敗:", error);
    return NextResponse.json({ error: "ArticleSessionの作成に失敗しました" }, { status: 500 });
  }
}
