import { NextRequest, NextResponse } from "next/server";
import { buildMergePreviewFor } from "@/app/lib/knowledge/lifecycle";

/**
 * POST /api/knowledge/merge-preview
 * body: { path: string, targetPath: string }
 *
 * Merge の Diff/Preview を返す（書き込みは一切しない・Phase4 修正2）。
 * 返却された previewToken を /api/knowledge/promote (action=merge) に渡すことで、
 * 「ユーザーが見て承認した内容」と「実際に書き込む内容」の一致をサーバー側で保証する。
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const path = typeof body?.path === "string" ? body.path : "";
    const targetPath = typeof body?.targetPath === "string" ? body.targetPath : "";
    if (!path || !targetPath) {
      return NextResponse.json({ error: "path と targetPath は必須です。" }, { status: 400 });
    }

    const preview = await buildMergePreviewFor(path, targetPath);
    return NextResponse.json(preview);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "不明なエラー";
    console.error("Error in POST /api/knowledge/merge-preview:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
