import { NextRequest, NextResponse } from "next/server";
import { appendDecision, DecisionAction } from "@/app/lib/fund/store";

const ACTIONS: DecisionAction[] = [
  "acknowledged",
  "bought",
  "skipped",
  "trimmed",
  "sold",
];

/**
 * POST /api/fund/decisions — 本人判断（確認・購入・見送り・一部売却等）を記録する。
 * 注文画面への遷移や証券API注文は行わない（§17）。
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const body = await request.json();

    if (!body?.ticker || typeof body.ticker !== "string") {
      return NextResponse.json({ error: "ticker は必須です" }, { status: 400 });
    }
    if (!ACTIONS.includes(body.action)) {
      return NextResponse.json(
        { error: `action は ${ACTIONS.join(" | ")} のいずれかです` },
        { status: 400 }
      );
    }

    const decision = await appendDecision({
      recommendationId: body.recommendationId ?? null,
      ticker: body.ticker,
      action: body.action,
      note: body.note ?? null,
      amountJpy: typeof body.amountJpy === "number" ? Math.floor(body.amountJpy) : null,
      shares: typeof body.shares === "number" ? Math.floor(body.shares) : null,
    });

    return NextResponse.json({ success: true, decision });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("[Fund Decisions API] Error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
