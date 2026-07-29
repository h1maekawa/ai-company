import { NextRequest, NextResponse } from "next/server";
import { getLastFailure, isCapacityConfigured, loadCapacity } from "@/app/lib/investing/capacity";

export const dynamic = "force-dynamic";

/**
 * GET /api/investing/capacity?month=YYYY-MM
 * 家計簿から当月の投資可能額と残り生活費を取得する。
 */
export async function GET(req: NextRequest): Promise<NextResponse> {
  try {
    const month = req.nextUrl.searchParams.get("month") ?? undefined;
    const capacity = await loadCapacity(month, { persist: true });
    return NextResponse.json({
      capacity,
      configured: isCapacityConfigured(),
      failure: capacity ? null : getLastFailure(),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "投資可能額の取得に失敗しました";
    console.error("[api/investing/capacity] 失敗:", error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
