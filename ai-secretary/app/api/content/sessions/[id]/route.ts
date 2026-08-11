import { NextRequest, NextResponse } from "next/server";
import { ARTICLE_STAGES, ArticleStage, canAdvanceTo } from "@/app/lib/content/note-studio/types";
import { loadSession, saveSession } from "@/app/lib/content/note-studio/store";

export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
): Promise<NextResponse> {
  try {
    const session = await loadSession(params.id);
    if (!session) return NextResponse.json({ error: "ArticleSessionが見つかりません" }, { status: 404 });
    return NextResponse.json({ session });
  } catch (error) {
    console.error("[api/content/sessions/:id] GET失敗:", error);
    return NextResponse.json({ error: "取得に失敗しました" }, { status: 500 });
  }
}

/**
 * PATCH { stage? , title?, materialIds?, researchIds?, contentGoal?, offerIds?, ctaIds? }
 * stageは前進のみ許可（REVIEW→DRAFTの差し戻しのみ例外）。
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
): Promise<NextResponse> {
  try {
    const session = await loadSession(params.id);
    if (!session) return NextResponse.json({ error: "ArticleSessionが見つかりません" }, { status: 404 });

    const body = await req.json();
    let next = { ...session };

    if (body.stage) {
      const stage = body.stage as ArticleStage;
      if (!ARTICLE_STAGES.includes(stage)) {
        return NextResponse.json({ error: "不正なstageです" }, { status: 400 });
      }
      if (!canAdvanceTo(session.stage, stage)) {
        return NextResponse.json({ error: `${session.stage} から ${stage} へは遷移できません` }, { status: 400 });
      }
      next.stage = stage;
    }
    if (typeof body.title === "string") next.title = body.title;
    if (Array.isArray(body.materialIds)) next.materialIds = body.materialIds;
    if (Array.isArray(body.researchIds)) next.researchIds = body.researchIds;
    if (typeof body.angle === "string") next.angle = body.angle;
    if (typeof body.outline === "string") next.outline = body.outline;
    if (typeof body.contentGoal === "string") next.contentGoal = body.contentGoal;
    if (Array.isArray(body.offerIds)) next.offerIds = body.offerIds;
    if (Array.isArray(body.ctaIds)) next.ctaIds = body.ctaIds;

    next.updatedAt = new Date().toISOString();
    await saveSession(next);
    return NextResponse.json({ session: next });
  } catch (error) {
    console.error("[api/content/sessions/:id] PATCH失敗:", error);
    return NextResponse.json({ error: "更新に失敗しました" }, { status: 500 });
  }
}
