import { NextRequest, NextResponse } from "next/server";
import { verifyCronSecret } from "@/app/lib/integrations/machine-auth";
import { runDailyXAutomation, DAILY_X_LOCK_TTL_SEC } from "@/app/lib/note/automation/dailyX";
import { withLock } from "@/app/lib/note/publishing/queue";
import { runResearch } from "@/app/lib/note/research/run";
import { tokyoDateKey } from "@/app/lib/note/tokyoDate";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** Midday/eveningだけのJIT refresh。未来のuntouched slot以外はDailyX executorが変更しない。 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const auth = verifyCronSecret(request);
  if (!auth.ok) return NextResponse.json({ error: auth.reason }, { status: 401 });
  const now = new Date();
  const hour = Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Tokyo", hour: "2-digit", hour12: false }).format(now));
  const window = hour >= 10 && hour < 15 ? "midday" : hour >= 18 && hour < 23 ? "evening" : null;
  if (!window) return NextResponse.json({ skipped: true, reason: "outside intraday refresh window" });
  const lockKey = `x-intraday-refresh:${tokyoDateKey(now)}:${window}`;
  try {
    const result = await withLock(lockKey, async () => {
      const research = await runResearch();
      const dailyX = await runDailyXAutomation();
      return { research: { fetched: research.fetched, newItems: research.newItems, failures: research.failures.length }, dailyX };
    }, { ttlSec: DAILY_X_LOCK_TTL_SEC });
    if (!result) return NextResponse.json({ skipped: true, reason: "already completed or running" });
    return NextResponse.json({ ok: true, window, ...result });
  } catch (error) {
    console.error("[cron/x-intraday-refresh] failed", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "intraday refresh failed" }, { status: 500 });
  }
}
