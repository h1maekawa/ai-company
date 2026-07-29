import { NextRequest, NextResponse } from "next/server";
import { loadIdeas, saveIdeas, loadBrand } from "@/app/lib/note/store";
import { harvestIdeas } from "@/app/lib/note/harvest";
import { Idea } from "@/app/lib/note/types";

export const dynamic = "force-dynamic";

/** GET /api/note/ideas — ジャンルとネタ一覧 */
export async function GET(): Promise<NextResponse> {
  try {
    return NextResponse.json(await loadIdeas());
  } catch (error) {
    const message = error instanceof Error ? error.message : "ネタ帳の取得に失敗しました";
    console.error("[api/note/ideas] GET失敗:", error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * POST /api/note/ideas
 *   { action: "harvest" }      朝会の完了タスクからネタを拾う
 *   { action: "add", idea }    手動で1件追加
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const body = (await req.json()) as { action?: string; idea?: Partial<Idea>; date?: string };
    const file = await loadIdeas();

    if (body.action === "harvest") {
      const { brand } = await loadBrand();
      const result = await harvestIdeas(file.genres, brand, file.ideas, body.date);
      if (result.ideas.length === 0) {
        return NextResponse.json({
          ...file,
          added: 0,
          sourceDate: result.sourceDate,
          doneCount: result.doneCount,
        });
      }
      const saved = await saveIdeas({ ...file, ideas: [...result.ideas, ...file.ideas] });
      return NextResponse.json({
        ...saved,
        added: result.ideas.length,
        sourceDate: result.sourceDate,
        doneCount: result.doneCount,
      });
    }

    const title = String(body.idea?.title ?? "").trim();
    if (!title) {
      return NextResponse.json({ error: "タイトルを入力してください" }, { status: 400 });
    }
    const genreId = file.genres.some((g) => g.id === body.idea?.genreId)
      ? String(body.idea?.genreId)
      : file.genres[0].id;

    const idea: Idea = {
      id: `idea${Date.now().toString(36)}`,
      title,
      genreId,
      status: "inbox",
      source: "manual",
      takeaway: String(body.idea?.takeaway ?? "").trim() || undefined,
      memo: String(body.idea?.memo ?? "").trim() || undefined,
      createdAt: new Date().toISOString(),
    };
    const saved = await saveIdeas({ ...file, ideas: [idea, ...file.ideas] });
    return NextResponse.json({ ...saved, added: 1 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "ネタの保存に失敗しました";
    console.error("[api/note/ideas] POST失敗:", error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/** PUT /api/note/ideas — 一覧をまとめて更新（状態変更・削除） */
export async function PUT(req: NextRequest): Promise<NextResponse> {
  try {
    const body = (await req.json()) as { ideas?: Idea[] };
    if (!Array.isArray(body.ideas)) {
      return NextResponse.json({ error: "ideas が必要です" }, { status: 400 });
    }
    const file = await loadIdeas();
    return NextResponse.json(await saveIdeas({ ...file, ideas: body.ideas }));
  } catch (error) {
    const message = error instanceof Error ? error.message : "ネタの更新に失敗しました";
    console.error("[api/note/ideas] PUT失敗:", error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
