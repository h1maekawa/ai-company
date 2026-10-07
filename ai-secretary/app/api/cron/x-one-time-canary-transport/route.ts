import { NextRequest, NextResponse } from "next/server";
import { verifyCronSecret } from "@/app/lib/integrations/machine-auth";
import { withLock } from "@/app/lib/note/publishing/queue";
import { DAILY_X_LOCK_TTL_SEC, runOneTimeCanaryTransport } from "@/app/lib/note/automation/dailyX";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** Never scheduled by Vercel Cron. Requires an explicit authenticated POST exactly once. */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const auth = verifyCronSecret(request);
  if (!auth.ok) return NextResponse.json({ error: auth.reason }, { status: 401 });
  try {
    const result = await withLock("daily-x-publish", runOneTimeCanaryTransport, { ttlSec: DAILY_X_LOCK_TTL_SEC });
    if (!result) return NextResponse.json({ skipped: true, reason: "DailyXが既に実行中です" }, { status: 409 });
    return NextResponse.json({ ok: result.scheduledDraftIds?.length === 1 && !result.haltedReason, ...result });
  } catch (error) {
    console.error("[cron/x-one-time-canary-transport] failed:", error);
    return NextResponse.json({ error: "One-time Canaryを停止しました。再実行せず状態を確認してください" }, { status: 500 });
  }
}
