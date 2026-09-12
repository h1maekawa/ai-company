import { NextRequest, NextResponse } from "next/server";
import {
  loadFinancialSettings,
  normalizeFinancialSettings,
  saveFinancialSettings,
} from "@/app/lib/company/financialSettings";

export const dynamic = "force-dynamic";

/** GET /api/company/settings/financial — FIRE・財務設定（Phase 5 §37） */
export async function GET(): Promise<NextResponse> {
  try {
    return NextResponse.json(await loadFinancialSettings());
  } catch (error) {
    console.error("[api/company/settings/financial] GET失敗:", error);
    return NextResponse.json({ error: "設定の取得に失敗しました" }, { status: 500 });
  }
}

/**
 * PUT — 設定の保存。
 * どの項目も必須ではない（§36）。未設定のものは null のまま保たれ、
 * FIRE計算は NOT_CONFIGURED を維持する。
 */
export async function PUT(req: NextRequest): Promise<NextResponse> {
  try {
    const body = await req.json();
    const current = await loadFinancialSettings();
    const saved = await saveFinancialSettings(
      normalizeFinancialSettings({ ...current, ...body })
    );
    return NextResponse.json(saved);
  } catch (error) {
    console.error("[api/company/settings/financial] PUT失敗:", error);
    return NextResponse.json({ error: "設定の保存に失敗しました" }, { status: 500 });
  }
}
