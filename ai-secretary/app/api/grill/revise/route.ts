import { NextRequest, NextResponse } from "next/server";
import { reviseGrilling } from "@/app/lib/grill/orchestrator";

/**
 * POST /api/grill/revise — 「修正して再Grill」（docs/15 D8）
 * body: { sessionId: string, request: string }
 *
 * 追加論点をDesign Treeへ足してFrontierを復活させ、status を active に戻す。
 */
/**
 * エラーの種類でHTTPコードを決める（Phase5.2）。
 * サーバー障害ではない「不正な状態遷移」を500で返さない。
 *   404: セッションが存在しない
 *   409: 現在のSession Stateと操作が競合（confirmed後のanswer 等）
 *   400: 入力不正
 *   500: それ以外（本当のサーバーエラー）
 */
function statusForError(message: string): number {
  if (/セッションが見つかりません/.test(message)) return 404;
  if (/のため回答できません|のため再Grillできません|未生成のため承認できません|previewToken|Frontierが残っています/.test(message)) {
    return 409;
  }
  if (/必須です|いずれかです|無効な|不正な/.test(message)) return 400;
  return 500;
}

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
    return NextResponse.json({ error: msg }, { status: statusForError(msg) });
  }
}
