import { NextResponse } from "next/server";
import { listProviderStatuses } from "@/app/lib/content/core/providers/registry";

export const dynamic = "force-dynamic";

/** GET: 各ContentSourceProviderの可用性（Timeboxが未接続でも例外にせず available:false を返す） */
export async function GET(): Promise<NextResponse> {
  try {
    return NextResponse.json({ providers: await listProviderStatuses() });
  } catch (error) {
    console.error("[api/content/providers] GET失敗:", error);
    return NextResponse.json({ error: "Provider状態の取得に失敗しました" }, { status: 500 });
  }
}
