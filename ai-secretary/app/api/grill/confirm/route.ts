import { NextRequest, NextResponse } from "next/server";
import { confirmGrilling } from "@/app/lib/grill/orchestrator";

/**
 * POST /api/grill/confirm — Shared Understanding を人間が承認する（docs/15 D8/D9）
 * body: { sessionId: string }
 *
 * 承認された瞬間にのみ、Shared Understanding を Phase4 Capture Flow へ渡す
 * （Inbox Candidate → /weekly-review → Human Approval → Formal Knowledge）。
 * Grilling独自の正式Knowledge保存・Vault要約保存は行わない。
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const sessionId = typeof body?.sessionId === "string" ? body.sessionId : "";
    if (!sessionId) return NextResponse.json({ error: "sessionId は必須です。" }, { status: 400 });

    const result = await confirmGrilling(sessionId);
    return NextResponse.json(result);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "不明なエラー";
    console.error("Error in POST /api/grill/confirm:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
