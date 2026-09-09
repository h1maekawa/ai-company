import { NextRequest, NextResponse } from "next/server";
import { verifyCronSecret } from "@/app/lib/integrations/machine-auth";
import { withLock } from "@/app/lib/note/publishing/queue";
import { loadPortfolio } from "@/app/lib/investing/portfolio";
import { recordSnapshot } from "@/app/lib/investing/history";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * GET /api/cron/investing-snapshot
 *
 * 市場時間中に現在値でポートフォリオを再評価し、日中スナップショットを追記する（TASK-F3）。
 * 投信は日次NAVのままなので、実質は株の値動きが資産推移へ反映される。
 * 書き込み競合を避けるため withLock で直列化し、値が動いていなければ書かない。
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const auth = verifyCronSecret(request);
  if (!auth.ok) return NextResponse.json({ error: auth.reason }, { status: 401 });

  try {
    const result = await withLock("investing-snapshot", async () => {
      const portfolio = await loadPortfolio();
      const points = await recordSnapshot(portfolio.summary.totalValueJpy, { intraday: true });
      return {
        totalValueJpy: portfolio.summary.totalValueJpy,
        points: points.length,
        freshness: portfolio.freshness ?? null,
        source: portfolio.source,
      };
    });
    if (!result) return NextResponse.json({ skipped: true, reason: "すでに実行中です" });
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    console.error("[cron/investing-snapshot] 失敗:", error);
    return NextResponse.json(
      { error: "資産スナップショットの記録に失敗しました。次回再試行します" },
      { status: 500 }
    );
  }
}
