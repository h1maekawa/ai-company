import { NextResponse } from "next/server";
import { runMarketIntake } from "@/app/lib/agents/market";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * POST /api/agents/market — 市況をリサーチ材料として取り込む（要件5）
 *
 * 通常は毎朝のリサーチcronから自動で走る。ここは手動実行用。
 * 新しい材料が無い日は何もせず、その理由を返す。
 */
export async function POST(): Promise<NextResponse> {
  try {
    return NextResponse.json(await runMarketIntake());
  } catch (error) {
    console.error("[api/agents/market] 失敗:", error);
    return NextResponse.json({ error: "市況の取り込みに失敗しました" }, { status: 500 });
  }
}
