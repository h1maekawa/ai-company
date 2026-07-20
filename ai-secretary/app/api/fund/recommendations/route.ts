import { NextResponse } from "next/server";
import { loadRecommendations } from "@/app/lib/fund/store";

/** GET /api/fund/recommendations — AI提案ログ（新しい順） */
export async function GET(): Promise<NextResponse> {
  try {
    const recommendations = await loadRecommendations();
    return NextResponse.json({ success: true, recommendations });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
