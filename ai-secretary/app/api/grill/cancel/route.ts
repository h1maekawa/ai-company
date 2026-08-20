import { NextRequest, NextResponse } from "next/server";
import { cancelGrilling } from "@/app/lib/grill/orchestrator";

/** POST /api/grill/cancel — セッションを破棄する（docs/15 D8） */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const sessionId = typeof body?.sessionId === "string" ? body.sessionId : "";
    if (!sessionId) return NextResponse.json({ error: "sessionId は必須です。" }, { status: 400 });
    const view = await cancelGrilling(sessionId);
    return NextResponse.json(view);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "不明なエラー";
    console.error("Error in POST /api/grill/cancel:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
