import { NextResponse } from "next/server";
import { getVaultFile } from "@/app/lib/vault";
import { extractHoldingsJson } from "@/app/lib/fund/rakutenCsv";

const HOLDINGS_PATH = "memory/personal/fund/holdings.md";
const CAPACITY_PATH = "memory/personal/fund/capacity.md";

export interface CapacityData {
  target_month: string | null;
  investable_amount: number | null;
  personal_cash_floor: number | null;
  already_invested: number | null;
  source: "manual" | "flow-plus";
  calculated_at: string | null;
}

/** capacity.md のjsonブロックを読み取る。Phase 2/3でFlow+ API自動取得に置換予定 */
function parseCapacity(markdown: string): CapacityData | null {
  const match = markdown.match(/```json\s*\n([\s\S]*?)\n```/);
  if (!match) return null;
  try {
    return JSON.parse(match[1]) as CapacityData;
  } catch {
    return null;
  }
}

/**
 * GET /api/fund/allocation
 * 保有スナップショット（50:50差分・集中度）と当月投資可能額を返す。
 * 投資可能額はPhase 1では手動入力（capacity.md）、未設定なら「未確定」。
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

    let capacity: CapacityData | null = null;
    try {
      const capacityFile = await getVaultFile(CAPACITY_PATH);
      capacity = parseCapacity(capacityFile.content || "");
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
      capacityStatus:
        capacity?.investable_amount != null ? "set" : "未確定",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("[Fund Allocation API] Error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
