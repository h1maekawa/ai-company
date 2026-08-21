import { NextRequest, NextResponse } from "next/server";
import { generateOutline } from "@/app/lib/content/note-studio/interview";
import { loadSession, saveSession } from "@/app/lib/content/note-studio/store";
import { loadContentCore } from "@/app/lib/content/core/store";

export const dynamic = "force-dynamic";

/** POST: Angle確定後に構成案を生成する（本文はここでは書かない） */
export async function POST(
  _req: NextRequest,
  { params }: { params: { id: string } }
): Promise<NextResponse> {
  try {
    const session = await loadSession(params.id);
    if (!session) return NextResponse.json({ error: "ArticleSessionが見つかりません" }, { status: 404 });
    if (!session.angle) {
      return NextResponse.json({ error: "先にAngleを確定してください" }, { status: 400 });
    }

    const { materials } = await loadContentCore();
    const summaries = materials
      .filter((m) => session.materialIds.includes(m.id))
      .map((m) => m.summary ?? m.rawContent.slice(0, 200));

    const outline = await generateOutline(session, summaries);
    const next = { ...session, outline, updatedAt: new Date().toISOString() };
    await saveSession(next);
    return NextResponse.json({ session: next });
  } catch (error) {
    console.error("[api/content/sessions/:id/outline] POST失敗:", error);
    return NextResponse.json({ error: "Outlineの生成に失敗しました" }, { status: 500 });
  }
}

/** PATCH { outline }: 本人が構成を編集して確定する */
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
): Promise<NextResponse> {
  try {
    const session = await loadSession(params.id);
    if (!session) return NextResponse.json({ error: "ArticleSessionが見つかりません" }, { status: 404 });

    const body = await req.json();
    if (typeof body.outline !== "string") {
      return NextResponse.json({ error: "outlineを指定してください" }, { status: 400 });
    }
    const next = { ...session, outline: body.outline, updatedAt: new Date().toISOString() };
    await saveSession(next);
    return NextResponse.json({ session: next });
  } catch (error) {
    console.error("[api/content/sessions/:id/outline] PATCH失敗:", error);
    return NextResponse.json({ error: "Outlineの保存に失敗しました" }, { status: 500 });
  }
}
