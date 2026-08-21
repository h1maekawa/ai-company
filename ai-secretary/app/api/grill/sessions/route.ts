import { NextRequest, NextResponse } from "next/server";
import { getGrilling, listGrillingSessions } from "@/app/lib/grill/orchestrator";

// セッション状態は毎回ストアから読むため、ビルド時の静的プリレンダーを禁止する
export const dynamic = "force-dynamic";

/**
 * GET /api/grill/sessions        — 再開可能なセッション一覧（active / ready_for_confirmation）
 * GET /api/grill/sessions?id=xxx — 単一セッションの現在状態
 */
export async function GET(req: NextRequest) {
  try {
    const id = req.nextUrl.searchParams.get("id");
    if (id) {
      const view = await getGrilling(id);
      if (!view) return NextResponse.json({ error: "セッションが見つかりません。" }, { status: 404 });
      return NextResponse.json(view);
    }
    const items = await listGrillingSessions();
    return NextResponse.json({ count: items.length, items });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "不明なエラー";
    console.error("Error in GET /api/grill/sessions:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
