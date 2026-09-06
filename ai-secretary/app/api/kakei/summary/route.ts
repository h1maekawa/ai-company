import { NextResponse } from "next/server";
import { currentMonth } from "@/app/lib/kakei/month";
import { loadSnapshot } from "@/app/lib/kakei/snapshot";
import { createKakeiSource } from "@/app/lib/kakei/source";

export const dynamic = "force-dynamic";

/**
 * GET /api/kakei/summary — /kakei 画面用。middlewareでセッション保護済み。
 *
 * 家計簿アプリの集計を直接取りに行き、落ちていれば Vault のキャッシュに
 * 縮退する（stale:true で返す）。ai-company 側で数字は作らない。
 */
export async function GET(): Promise<NextResponse> {
  const month = currentMonth();

  try {
    const summary = await createKakeiSource().fetchSummary(month);
    return NextResponse.json({ ...summary, stale: false, connected: true });
  } catch (liveError) {
    const { summary } = await loadSnapshot(month);
    if (summary) {
      return NextResponse.json({
        ...summary,
        stale: true,
        connected: true,
        error: (liveError as Error).message,
      });
    }
    return NextResponse.json({
      month,
      connected: false,
      stale: false,
      error: (liveError as Error).message,
    });
  }
}
