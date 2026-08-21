import { NextRequest, NextResponse } from "next/server";
import { extractExperienceCandidate } from "@/app/lib/content/note-studio/interview";
import { candidateExperience, approveExperience, rejectExperience } from "@/app/lib/content/core/approval";
import { loadSession, saveSession } from "@/app/lib/content/note-studio/store";
import { loadExperiences, saveExperiences } from "@/app/lib/note/research/store";

export const dynamic = "force-dynamic";

/**
 * POST { action: "extract" }                          会話から実体験候補をAIが抜き出す（保存しない）
 * POST { action: "save", experience }                   候補をExperience Libraryへcandidateとして保存
 * PATCH { experienceId, decision: "approve"|"reject" }   本人承認/修正。承認前は絶対にapprovedにしない
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
      const draft = await extractExperienceCandidate(session);
      return NextResponse.json({ draft });
    }

    if (body.action === "save") {
      const e = body.experience ?? {};
      const entry = candidateExperience({
        title: e.title ?? session.title,
        occurredAt: e.occurredAt,
        genres: e.genres ?? [],
        summary: e.summary ?? "",
        whatHappened: e.whatHappened ?? "",
        whatWasTried: e.whatWasTried ?? "",
        whatWorked: e.whatWorked,
        whatDidNotWork: e.whatDidNotWork,
        lesson: e.lesson,
        reusableFacts: e.reusableFacts ?? [],
        sourceType: "conversation",
        sourcePath: undefined,
        sensitive: e.sensitive ?? false,
        sourceMessageIds: session.messages.map((m) => m.id),
        sourceMaterialIds: session.materialIds,
        evidence: e.evidence ?? [],
      });
      const existing = await loadExperiences();
      await saveExperiences([entry, ...existing]);

      const nextSession = { ...session, experienceIds: [...session.experienceIds, entry.id], updatedAt: new Date().toISOString() };
      await saveSession(nextSession);
      return NextResponse.json({ experience: entry, session: nextSession });
    }

    return NextResponse.json({ error: "actionを指定してください" }, { status: 400 });
  } catch (error) {
    console.error("[api/content/sessions/:id/experience] POST失敗:", error);
    return NextResponse.json({ error: "体験の処理に失敗しました" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest): Promise<NextResponse> {
  try {
    const body = await req.json();
    const experienceId = String(body.experienceId ?? "");
    const decision = body.decision;
    if (!experienceId || !["approve", "reject"].includes(decision)) {
      return NextResponse.json({ error: "experienceId と有効な decision が必要です" }, { status: 400 });
    }

    const experiences = await loadExperiences();
    const target = experiences.find((e) => e.id === experienceId);
    if (!target) return NextResponse.json({ error: "体験が見つかりません" }, { status: 404 });

    const updated = decision === "approve" ? approveExperience(target) : rejectExperience(target);
    const next = experiences.map((e) => (e.id === experienceId ? updated : e));
    await saveExperiences(next);
    return NextResponse.json({ experience: updated });
  } catch (error) {
    console.error("[api/content/sessions/:id/experience] PATCH失敗:", error);
    return NextResponse.json({ error: "体験の承認処理に失敗しました" }, { status: 500 });
  }
}
