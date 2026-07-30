import { NextRequest, NextResponse } from "next/server";
import {
  addExperience,
  harvestFromMorningPlan,
  updateExperience,
} from "@/app/lib/note/research/experience";
import { loadExperiences, saveExperiences } from "@/app/lib/note/research/store";

export const dynamic = "force-dynamic";

export async function GET(): Promise<NextResponse> {
  try {
    return NextResponse.json({ experiences: await loadExperiences() });
  } catch (error) {
    console.error("[api/note/experiences] GET失敗:", error);
    return NextResponse.json({ error: "体験の取得に失敗しました" }, { status: 500 });
  }
}

/**
 * POST
 *   { action: "add", experience }        手動で1件追加
 *   { action: "harvest", date? }         朝会の完了タスクから取り込む
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const body = await req.json();

    if (body.action === "harvest") {
      const result = await harvestFromMorningPlan(body.date);
      return NextResponse.json({
        experiences: await loadExperiences(),
        added: result.added.length,
        sourceDate: result.sourceDate,
        doneCount: result.doneCount,
      });
    }

    const title = String(body.experience?.title ?? "").trim();
    if (!title) {
      return NextResponse.json({ error: "タイトルを入力してください" }, { status: 400 });
    }
    const experiences = await addExperience(body.experience);
    return NextResponse.json({ experiences });
  } catch (error) {
    console.error("[api/note/experiences] POST失敗:", error);
    return NextResponse.json({ error: "体験の保存に失敗しました" }, { status: 500 });
  }
}

/** PUT — 1件更新（本人確認フラグの切り替えを含む）、または一覧の一括保存 */
export async function PUT(req: NextRequest): Promise<NextResponse> {
  try {
    const body = await req.json();

    if (Array.isArray(body.experiences)) {
      return NextResponse.json({ experiences: await saveExperiences(body.experiences) });
    }

    if (!body.id) {
      return NextResponse.json({ error: "id が必要です" }, { status: 400 });
    }
    return NextResponse.json({ experiences: await updateExperience(body.id, body.patch ?? {}) });
  } catch (error) {
    console.error("[api/note/experiences] PUT失敗:", error);
    return NextResponse.json({ error: "体験の更新に失敗しました" }, { status: 500 });
  }
}
