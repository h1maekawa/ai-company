import { NextResponse } from "next/server";
import { runResearch } from "@/app/lib/note/research/run";
import { withLock } from "@/app/lib/note/publishing/queue";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** POST /api/note/research/run — 手動でリサーチを実行する */
export async function POST(): Promise<NextResponse> {
  try {
    // 二重起動でVaultを壊さないようロックを取る
    const result = await withLock("research-run", () => runResearch());
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
