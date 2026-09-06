import { NextResponse } from "next/server";
import { loadLedger, aggregate, loadBudget } from "@/app/lib/kakei/ledger";
import { KAKEI_CATEGORIES } from "@/app/lib/kakei/classify";

export const dynamic = "force-dynamic";

function currentMonth(): string {
  const d = new Date(Date.now() + 9 * 3600 * 1000);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** GET /api/kakei/summary — /kakei 画面用の集計JSON。middlewareでセッション保護済み */
export async function GET(): Promise<NextResponse> {
  const month = currentMonth();
  const { txs } = await loadLedger(month);
  const agg = aggregate(txs);
  const { income, fixed } = await loadBudget();
  const remaining =
    income != null && fixed != null ? income - fixed - agg.total : null;

  return NextResponse.json({
    month,
    total: agg.total,
    count: agg.count,
    byCategory: agg.byCategory,
    remaining,
    needsReview: agg.needsReview.map((t) => ({
      sourceId: t.sourceId, date: t.date, merchantRaw: t.merchantRaw,
      merchantNorm: t.merchantNorm, amount: t.amount, category: t.category,
    })),
    categories: KAKEI_CATEGORIES,
    connected: agg.count > 0,
  });
}
