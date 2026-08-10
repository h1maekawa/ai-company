import { NextRequest, NextResponse } from "next/server";
import { suggestAngles } from "@/app/lib/content/note-studio/interview";
import { loadSession, saveSession } from "@/app/lib/content/note-studio/store";
import { loadContentCore } from "@/app/lib/content/core/store";

export const dynamic = "force-dynamic";

/** POST: 同一Materialから複数Angleを提案する（保存はしない。選択はPATCHで） */
export async function POST(
  _req: NextRequest,
  { params }: { params: { id: string } }
): Promise<NextResponse> {
  try {
    const session = await loadSession(params.id);
    if (!session) return NextResponse.json({ error: "ArticleSessionが見つかりません" }, { status: 404 });

    const { materials } = await loadContentCore();
    const summaries = materials
      .filter((m) => session.materialIds.includes(m.id))
      .map((m) => m.summary ?? m.rawContent.slice(0, 200));

    const suggestions = await suggestAngles(session, summaries);
    const angles = suggestions.map((s, i) => ({
      id: `angle_${Date.now().toString(36)}${i}`,
      label: s.label,
      description: s.description,
      selected: false,
    }));

    const next = { ...session, angles, updatedAt: new Date().toISOString() };
    await saveSession(next);
    return NextResponse.json({ session: next });
  } catch (error) {
    console.error("[api/content/sessions/:id/angles] POST失敗:", error);
    return NextResponse.json({ error: "Angleの提案に失敗しました" }, { status: 500 });
  }
}

/** PATCH { angleId } または { angle: "自由記述" }: 本人が選択・編集する */
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
): Promise<NextResponse> {
  try {
    const session = await loadSession(params.id);
    if (!session) return NextResponse.json({ error: "ArticleSessionが見つかりません" }, { status: 404 });

    const body = await req.json();
    let angle = session.angle;
    let angles = session.angles;

    if (typeof body.angle === "string" && body.angle.trim()) {
      angle = body.angle.trim();
    } else if (body.angleId) {
      const selected = session.angles?.find((a) => a.id === body.angleId);
      if (!selected) return NextResponse.json({ error: "Angleが見つかりません" }, { status: 404 });
      angle = selected.description;
      angles = session.angles?.map((a) => ({ ...a, selected: a.id === body.angleId }));
    } else {
      return NextResponse.json({ error: "angle か angleId を指定してください" }, { status: 400 });
    }

    const next = { ...session, angle, angles, updatedAt: new Date().toISOString() };
    await saveSession(next);
    return NextResponse.json({ session: next });
  } catch (error) {
    console.error("[api/content/sessions/:id/angles] PATCH失敗:", error);
    return NextResponse.json({ error: "Angleの確定に失敗しました" }, { status: 500 });
  }
}
