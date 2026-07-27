import { NextResponse } from "next/server";
import { loadWatchlist } from "@/app/lib/investing/watchlist";

export const dynamic = "force-dynamic";

/** GET /api/investing/watchlist — 監視銘柄リスト（テーマ別） */
export async function GET(): Promise<NextResponse> {
  try {
    return NextResponse.json(await loadWatchlist());
  } catch (error) {
    const message = error instanceof Error ? error.message : "監視リストの取得に失敗しました";
    console.error("[api/investing/watchlist] 失敗:", error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
