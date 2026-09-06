import { NextRequest, NextResponse } from "next/server";
import { loadLedger, saveLedger, upsertRule } from "@/app/lib/kakei/ledger";

export const dynamic = "force-dynamic";

/** POST /api/kakei/recategorize — 要確認の1件を確定し、店名ルールを学習 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const { month, sourceId, category, merchantNorm } = (await req.json()) as {
      month: string; sourceId: string; category: string; merchantNorm: string;
    };
    if (!month || !sourceId || !category) {
      return NextResponse.json({ error: "month/sourceId/category は必須です" }, { status: 400 });
    }
    const { txs, sha } = await loadLedger(month);
    const idx = txs.findIndex((t) => t.sourceId === sourceId);
    if (idx < 0) return NextResponse.json({ error: "対象取引が見つかりません" }, { status: 404 });

    txs[idx] = { ...txs[idx], category, confidence: 1, needsReview: false };
    await saveLedger(month, txs, sha);
    if (merchantNorm) await upsertRule(merchantNorm, category); // 次回から自動

    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
