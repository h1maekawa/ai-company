import { NextRequest, NextResponse } from "next/server";
import { verifyCronSecret } from "@/app/lib/integrations/machine-auth";
import { postToSlack } from "@/app/lib/integrations/slack/blocks";
import { currentMonth } from "@/app/lib/kakei/month";
import { loadSnapshot } from "@/app/lib/kakei/snapshot";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const yen = (n: number) => `¥${n.toLocaleString("ja-JP")}`;

/**
 * GET /api/cron/kakei-daily — 今月の家計サマリをSlackへ。
 * kakei-sync が保存したキャッシュを読むだけなので、集計APIが落ちていても
 * 前回の数字は届く（家計簿アプリを開かなくてよい、が目的）。
 */
export async function GET(req: NextRequest): Promise<NextResponse> {
  const auth = verifyCronSecret(req);
  if (!auth.ok) return NextResponse.json({ error: auth.reason }, { status: 401 });
  try {
    const month = currentMonth();
    const { summary } = await loadSnapshot(month);
    if (!summary) {
      return NextResponse.json({ skipped: true, reason: `${month} のキャッシュがまだありません` });
    }

    const top = summary.byCategory
      .slice(0, 3)
      .map((c) => `${c.category} ${yen(c.amount)}`)
      .join(" / ");

    const lines = [
      `*🧾 今月の家計（${month}）*`,
      `今月あと使える: *${yen(summary.variable.remaining)}*（1日 ${yen(summary.variable.dailyAllowance)} / 残り${summary.variable.daysLeft}日）`,
      `支出合計: ${yen(summary.totalSpent)}（変動費 ${yen(summary.variable.spent)} / 予算 ${yen(summary.variable.budget)}）`,
      top ? `内訳上位: ${top}` : "",
      summary.variable.pace > 1 ? `⚠️ ペース ${summary.variable.pace}（使いすぎ傾向）` : "",
      summary.needsReview.count
        ? `要確認: ${summary.needsReview.count}件（家計簿アプリで修正）`
        : "✅ 要確認なし",
    ];

    const res = await postToSlack(lines.filter(Boolean).join("\n"));
    return NextResponse.json({ ok: res.ok, month, remaining: summary.variable.remaining });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
