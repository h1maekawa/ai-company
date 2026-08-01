import { NextRequest, NextResponse } from "next/server";
import { verifyCronSecret } from "@/app/lib/integrations/machine-auth";
import { withLock } from "@/app/lib/note/publishing/queue";
import { runDailyXAutomation } from "@/app/lib/note/automation/dailyX";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: NextRequest): Promise<NextResponse> {
  const auth = verifyCronSecret(request);
  if (!auth.ok) return NextResponse.json({ error: auth.reason }, { status: 401 });

  try {
    const result = await withLock("daily-x-publish", runDailyXAutomation);
    if (!result) return NextResponse.json({ skipped: true, reason: "すでに実行中です" });
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    console.error("[cron/x-daily-publish] 失敗:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "X投稿自動化に失敗しました" },
      { status: 500 }
    );
  }
}

