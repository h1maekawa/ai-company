import { NextRequest, NextResponse } from "next/server";
import { verifyCronSecret } from "@/app/lib/integrations/machine-auth";
import { runPerformanceSync } from "@/app/lib/note/automation/performanceSync";
import { withLock } from "@/app/lib/note/publishing/queue";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: NextRequest): Promise<NextResponse> {
  const auth = verifyCronSecret(request);
  if (!auth.ok) return NextResponse.json({ error: auth.reason }, { status: 401 });
  try {
    const result = await withLock("x-performance-sync", () => runPerformanceSync());
    if (!result) return NextResponse.json({ skipped: true, reason: "すでに実行中です" });
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    console.error("[cron/x-performance-sync] 失敗:", error);
    return NextResponse.json({ error: "Performance Syncに失敗しました。次回再試行します" }, { status: 500 });
  }
}
