import { NextResponse } from "next/server";
import { runAutoApproval } from "@/app/lib/review/autoApprove";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * POST /api/review/auto-approve — 自動承認の実行（要件10）
 *
 * 自動テストを全て通過した項目のうち、その工程が「自動承認」に
 * 設定されているものだけを承認する。通らなかったものは理由付きで返す。
 * 夜間レビューのcronからも同じ関数が呼ばれる。
 */
export async function POST(): Promise<NextResponse> {
  try {
    return NextResponse.json(await runAutoApproval());
  } catch (error) {
    console.error("[api/review/auto-approve] 失敗:", error);
    return NextResponse.json({ error: "自動承認の実行に失敗しました" }, { status: 500 });
  }
}
