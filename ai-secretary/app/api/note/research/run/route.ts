import { NextRequest, NextResponse } from "next/server";
import { runResearch } from "@/app/lib/note/research/run";
import { withLock } from "@/app/lib/note/publishing/queue";
import type { ResearchRequest } from "@/app/lib/note/research/types";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** POST /api/note/research/run — 手動でリサーチを実行する */
export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    let body: ResearchRequest = {};
    try {
      body = (await req.json()) as ResearchRequest;
    } catch {
      // 後方互換: 本文なしの既存呼び出しも従来どおり実行する。
    }
    // 二重起動でVaultを壊さないようロックを取る
    const result = await withLock("research-run", () =>
      runResearch({
        focusTopic: body.focusTopic?.trim() || undefined,
        platform: body.platform ?? "both",
        xQuery: body.xQuery?.trim() || undefined,
        genreId: body.genreId || undefined,
      })
    );
    if (!result) {
      return NextResponse.json(
        { error: "リサーチが既に実行中です。しばらく待ってからお試しください" },
        { status: 409 }
      );
    }
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "リサーチに失敗しました";
    console.error("[api/note/research/run] 失敗:", error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
