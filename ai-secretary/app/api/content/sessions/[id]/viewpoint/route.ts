import { NextRequest, NextResponse } from "next/server";
import { extractViewpointCandidate } from "@/app/lib/content/note-studio/interview";
import { candidateViewpoint, approveViewpoint, rejectViewpoint } from "@/app/lib/content/core/approval";
import { loadSession, saveSession } from "@/app/lib/content/note-studio/store";
import { loadViewpoints, saveViewpoints } from "@/app/lib/note/research/store";

export const dynamic = "force-dynamic";

/**
 * POST { action: "extract" }                        会話からAIが候補を推測して返す（保存しない）
 * POST { action: "save", viewpoint }                 候補をViewpoint Libraryへcandidateとして保存
 * PATCH { viewpointId, decision: "approve"|"reject" } 本人承認/修正。承認前は絶対にapprovedにしない
 */
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
): Promise<NextResponse> {
  try {
    const session = await loadSession(params.id);
    if (!session) return NextResponse.json({ error: "ArticleSessionが見つかりません" }, { status: 404 });

    const body = await req.json();

    if (body.action === "extract") {
      const draft = await extractViewpointCandidate(session);
      return NextResponse.json({ draft });
    }

    if (body.action === "save") {
      const v = body.viewpoint ?? {};
      const entry = candidateViewpoint({
        title: v.title ?? session.title,
        topic: v.topic ?? session.title,
        opinion: v.opinion ?? "",
        reasons: v.reasons ?? [],
        uncertainties: v.uncertainties ?? [],
        sourceMessageIds: session.messages.map((m) => m.id),
        sourceMaterialIds: session.materialIds,
      });
      const existing = await loadViewpoints();
      await saveViewpoints([entry, ...existing]);

      const nextSession = { ...session, viewpointIds: [...session.viewpointIds, entry.id], updatedAt: new Date().toISOString() };
      await saveSession(nextSession);
      return NextResponse.json({ viewpoint: entry, session: nextSession });
    }

    return NextResponse.json({ error: "actionを指定してください" }, { status: 400 });
  } catch (error) {
    console.error("[api/content/sessions/:id/viewpoint] POST失敗:", error);
    return NextResponse.json({ error: "視点の処理に失敗しました" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest): Promise<NextResponse> {
  try {
    const body = await req.json();
    const viewpointId = String(body.viewpointId ?? "");
    const decision = body.decision;
    if (!viewpointId || !["approve", "reject"].includes(decision)) {
      return NextResponse.json({ error: "viewpointId と有効な decision が必要です" }, { status: 400 });
    }

    const viewpoints = await loadViewpoints();
    const target = viewpoints.find((v) => v.id === viewpointId);
    if (!target) return NextResponse.json({ error: "視点が見つかりません" }, { status: 404 });

    // このAPI呼び出し（＝本人操作）だけが approved/rejected を作れる
    const updated = decision === "approve" ? approveViewpoint(target) : rejectViewpoint(target);
    const next = viewpoints.map((v) => (v.id === viewpointId ? updated : v));
    await saveViewpoints(next);
    return NextResponse.json({ viewpoint: updated });
  } catch (error) {
    console.error("[api/content/sessions/:id/viewpoint] PATCH失敗:", error);
    return NextResponse.json({ error: "視点の承認処理に失敗しました" }, { status: 500 });
  }
}
