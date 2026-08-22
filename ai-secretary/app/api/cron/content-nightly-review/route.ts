import { NextRequest, NextResponse } from "next/server";
import { verifyCronSecret } from "@/app/lib/integrations/machine-auth";
import { runNightlyGrowthReview } from "@/app/lib/note/automation/nightlyGrowthReview";
import { withLock } from "@/app/lib/note/publishing/queue";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: NextRequest): Promise<NextResponse> {
  const auth = verifyCronSecret(request);
  if (!auth.ok) return NextResponse.json({ error: auth.reason }, { status: 401 });
  try {
    const result = await withLock("content-nightly-review", () => runNightlyGrowthReview());
    if (!result) return NextResponse.json({ skipped: true, reason: "すでに実行中です" });
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    console.error("[cron/content-nightly-review] 失敗:", error);
    return NextResponse.json({ error: "日次レビューに失敗しました。投稿システムは継続します" }, { status: 500 });
  }
}
