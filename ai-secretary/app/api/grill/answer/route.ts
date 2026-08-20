import { NextRequest, NextResponse } from "next/server";
import { answerGrilling } from "@/app/lib/grill/orchestrator";

/**
 * POST /api/grill/answer — 現在のFrontierへまとめて回答する（docs/15 D7）
 * body: { sessionId: string, answers: Record<nodeId, string> }
 *
 * Frontierが空になった時点でShared Understandingを生成し status=ready_for_confirmation にする。
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
    const answers = body?.answers;
    if (!sessionId) return NextResponse.json({ error: "sessionId は必須です。" }, { status: 400 });
    if (!answers || typeof answers !== "object" || Array.isArray(answers)) {
      return NextResponse.json({ error: "answers は { nodeId: 回答 } 形式が必須です。" }, { status: 400 });
    }

    const clean: Record<string, string> = {};
    for (const [k, v] of Object.entries(answers as Record<string, unknown>)) {
      if (typeof v === "string" && v.trim()) clean[k] = v.trim();
    }
    if (Object.keys(clean).length === 0) {
      return NextResponse.json({ error: "回答が空です。" }, { status: 400 });
    }

    const view = await answerGrilling({ sessionId, answers: clean });
    return NextResponse.json(view);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "不明なエラー";
    console.error("Error in POST /api/grill/answer:", msg);
    return NextResponse.json({ error: msg }, { status: statusForError(msg) });
  }
}
