import { NextRequest, NextResponse } from "next/server";
import { reviseGrilling } from "@/app/lib/grill/orchestrator";

/**
 * POST /api/grill/revise — 「修正して再Grill」（docs/15 D8）
 * body: { sessionId: string, request: string }
 *
 * 追加論点をDesign Treeへ足してFrontierを復活させ、status を active に戻す。
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const sessionId = typeof body?.sessionId === "string" ? body.sessionId : "";
    const request = typeof body?.request === "string" ? body.request.trim() : "";
    if (!sessionId) return NextResponse.json({ error: "sessionId は必須です。" }, { status: 400 });
    if (!request) return NextResponse.json({ error: "request（追加で詰めたいこと）は必須です。" }, { status: 400 });

    const view = await reviseGrilling({ sessionId, request });
    return NextResponse.json(view);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "不明なエラー";
    console.error("Error in POST /api/grill/revise:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
