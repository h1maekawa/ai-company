import { NextRequest, NextResponse } from "next/server";
import { loadReferences, saveReferences } from "@/app/lib/note/research/store";
import {
  ReferenceNoteCreator,
  ReferenceXAccount,
} from "@/app/lib/note/research/types";

export const dynamic = "force-dynamic";

export async function GET(): Promise<NextResponse> {
  try {
    return NextResponse.json(await loadReferences());
  } catch (error) {
    console.error("[api/note/research/references] GET失敗:", error);
    return NextResponse.json({ error: "参考アカウントの取得に失敗しました" }, { status: 500 });
  }
}

/** 一覧をまとめて保存する（追加・編集・停止・削除はUI側で配列を作る） */
export async function PUT(req: NextRequest): Promise<NextResponse> {
  try {
    const body = (await req.json()) as {
      xAccounts?: ReferenceXAccount[];
      noteCreators?: ReferenceNoteCreator[];
    };
    const current = await loadReferences();
    const now = new Date().toISOString();

    const xAccounts = (body.xAccounts ?? current.xAccounts).map((a) => ({
      ...a,
      handle: String(a.handle ?? "").replace(/^@/, "").trim(),
      profileUrl: a.profileUrl || `https://x.com/${String(a.handle ?? "").replace(/^@/, "")}`,
      updatedAt: now,
    }));

    const noteCreators = (body.noteCreators ?? current.noteCreators).map((c) => ({
      ...c,
      updatedAt: now,
    }));

    return NextResponse.json(await saveReferences({ xAccounts, noteCreators }));
  } catch (error) {
    console.error("[api/note/research/references] PUT失敗:", error);
    return NextResponse.json({ error: "参考アカウントの保存に失敗しました" }, { status: 500 });
  }
}
