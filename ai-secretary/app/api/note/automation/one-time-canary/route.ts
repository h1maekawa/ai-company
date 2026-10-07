import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE, verifySessionToken } from "@/app/lib/auth/session";
import { isSameOriginMutation } from "@/app/lib/company/execution/requestProtection";
import { withLock } from "@/app/lib/note/publishing/queue";
import { DAILY_X_LOCK_TTL_SEC, runOneTimeCanaryTransport } from "@/app/lib/note/automation/dailyX";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** Browser-session trigger; the one-time Redis claim and current-plan checks remain the final authority. */
export async function POST(req: NextRequest): Promise<NextResponse> {
  if (!isSameOriginMutation(req)) return NextResponse.json({ error: "ORIGIN_DENIED" }, { status: 403 });
  const secret = process.env.SESSION_SECRET;
  if (!secret || !(await verifySessionToken(req.cookies.get(SESSION_COOKIE)?.value, secret))) {
    return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
  }
  try {
    const result = await withLock("daily-x-publish", runOneTimeCanaryTransport, { ttlSec: DAILY_X_LOCK_TTL_SEC });
    if (!result) return NextResponse.json({ error: "DailyXが既に実行中です" }, { status: 409 });
    return NextResponse.json({ ok: result.scheduledDraftIds?.length === 1 && !result.haltedReason, ...result });
  } catch (error) {
    console.error("[note/automation/one-time-canary] failed:", error);
    return NextResponse.json({ error: "One-time Canaryを停止しました。自動再試行せず状態を確認してください" }, { status: 500 });
  }
}
