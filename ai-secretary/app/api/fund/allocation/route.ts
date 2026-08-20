import { NextResponse } from "next/server";
import { getVaultFile } from "@/app/lib/vault";
import { extractHoldingsJson } from "@/app/lib/fund/rakutenCsv";
import { loadCapacity } from "@/app/lib/investing/capacity";

const HOLDINGS_PATH = "memory/personal/fund/holdings.md";

export interface CapacityData {
  target_month: string | null;
  investable_amount: number | null;
  personal_cash_floor: number | null;
  already_invested: number | null;
  source: "manual" | "flow-plus";
  calculated_at: string | null;
}

/**
 * GET /api/fund/allocation
 * 保有スナップショット（50:50差分・集中度）と当月投資可能額を返す。
 *
 * Phase 3 (docs/14): capacity は Canonical Service = lib/investing/capacity.ts に一本化。
 * 以前この route が持っていた capacity.md 直読みの重複パーサは廃止し、loadCapacity() を使う。
 * レスポンス形状（capacity フィールド）は後方互換のため不変。
 */
export async function GET(): Promise<NextResponse> {
  try {
    let holdingsData: ReturnType<typeof extractHoldingsJson> = null;
    try {
      const holdingsFile = await getVaultFile(HOLDINGS_PATH);
      holdingsData = extractHoldingsJson(holdingsFile.content || "");
    } catch {
      // 未取込
    }

    // Canonical capacity service（Flow+自動取得 → capacity.md手入力 → null）
    let capacity: CapacityData | null = null;
    try {
      const cap = await loadCapacity();
      if (cap) {
        capacity = {
          target_month: cap.target_month ?? null,
          investable_amount: cap.investable_amount ?? null,
          personal_cash_floor: cap.personal_cash_floor ?? null,
          already_invested: cap.already_invested ?? null,
          source: cap.source === "flow_plus" ? "flow-plus" : "manual",
          calculated_at: cap.calculated_at ?? null,
        };
      }
    } catch {
      // 未設定
    }

    return NextResponse.json({
      success: true,
      imported: holdingsData !== null,
      importedAt: holdingsData?.importedAt ?? null,
      summary: holdingsData?.summary ?? null,
      holdings: holdingsData?.holdings ?? [],
      capacity,
      capacityStatus: capacity?.investable_amount != null ? "set" : "未確定",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("[Fund Allocation API] Error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
