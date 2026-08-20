import { NextRequest, NextResponse } from "next/server";
import { submitGrillFeedback } from "@/app/lib/grill/orchestrator";

/**
 * POST /api/grill/feedback — 壁打ちの品質評価（任意）
 * body: { sessionId: string, rating: "good"|"neutral"|"bad", comment?: string }
 *
 * これは Grilling Machine State（Redis/File）にのみ保存する品質改善用の情報であり、
 * 正式Knowledgeには一切入れない（Knowledge化されるのは Shared Understanding のみ）。
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
    const rating = body?.rating;
    if (!sessionId) return NextResponse.json({ error: "sessionId は必須です。" }, { status: 400 });
    if (rating !== "good" && rating !== "neutral" && rating !== "bad") {
      return NextResponse.json(
        { error: "rating は good|neutral|bad のいずれかです。" },
        { status: 400 }
      );
    }
    const view = await submitGrillFeedback({
      sessionId,
      rating,
      comment: typeof body?.comment === "string" ? body.comment : undefined,
    });
    return NextResponse.json(view);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "不明なエラー";
    console.error("Error in POST /api/grill/feedback:", msg);
    return NextResponse.json({ error: msg }, { status: statusForError(msg) });
  }
}
