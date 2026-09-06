import { NextRequest, NextResponse } from "next/server";
import { verifyCronSecret } from "@/app/lib/integrations/machine-auth";
import { postToSlack } from "@/app/lib/integrations/slack/blocks";
import { loadLedger, aggregate, loadBudget } from "@/app/lib/kakei/ledger";
import { currentMonth } from "@/app/lib/kakei/month";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const yen = (n: number) => `¥${n.toLocaleString("ja-JP")}`;

/** GET /api/cron/kakei-daily — 今月の家計サマリをSlackへ（開かなくても届く） */
export async function GET(req: NextRequest): Promise<NextResponse> {
  const auth = verifyCronSecret(req);
  if (!auth.ok) return NextResponse.json({ error: auth.reason }, { status: 401 });
  try {
    const month = currentMonth();
    const { txs } = await loadLedger(month);
    const agg = aggregate(txs);
    const { income, fixed } = await loadBudget();

    const top = Object.entries(agg.byCategory)
      .sort((a, b) => b[1] - a[1]).slice(0, 3)
      .map(([c, v]) => `${c} ${yen(v)}`).join(" / ");

    const lines = [
      `*🧾 今月の家計（${month}）*`,
      `支出合計: *${yen(agg.total)}*（${agg.count}件）`,
      top ? `内訳上位: ${top}` : "",
      agg.needsReview.length ? `⚠️ 要確認: ${agg.needsReview.length}件（/kakei で1タップ修正）` : "✅ 未分類なし",
    ];
    if (income != null && fixed != null) {
      const remaining = income - fixed - agg.total;
      lines.push(`今月あと使える目安: *${yen(remaining)}*`);
    }
    const text = lines.filter(Boolean).join("\n");
    const res = await postToSlack(text);
    return NextResponse.json({ ok: res.ok, month, total: agg.total });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
