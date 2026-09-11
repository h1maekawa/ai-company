import { NextRequest, NextResponse } from "next/server";
import { loadCompanyEvents } from "@/app/lib/company/eventStore";
import { computeMetrics } from "@/app/lib/company/metrics";

export const dynamic = "force-dynamic";

/**
 * GET /api/company/metrics?days=14 — 会社の指標（v3.1 §13）
 *
 * CEO介入率・自動化率・失敗率・処理時間・コストを返す。
 * Organization Observer が観測したイベントだけを根拠にする。
 */
export async function GET(req: NextRequest): Promise<NextResponse> {
  try {
    const raw = Number(new URL(req.url).searchParams.get("days"));
    const days = Number.isFinite(raw) && raw > 0 && raw <= 365 ? Math.floor(raw) : 14;

    const events = await loadCompanyEvents();
    return NextResponse.json({
      ...computeMetrics(events, days),
      /** 指標が意味を持つだけのデータが溜まっているか */
      sufficientData: events.length >= 20,
    });
  } catch (error) {
    console.error("[api/company/metrics] 失敗:", error);
    return NextResponse.json({ error: "指標の取得に失敗しました" }, { status: 500 });
  }
}
