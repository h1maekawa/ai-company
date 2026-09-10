import { NextResponse } from "next/server";
import { loadPipeline } from "@/app/lib/review/pipeline";

export const dynamic = "force-dynamic";

/** GET /api/pipeline — 工程ごとの進行状況（要件7） */
export async function GET(): Promise<NextResponse> {
  try {
    return NextResponse.json(await loadPipeline());
  } catch (error) {
    console.error("[api/pipeline] 失敗:", error);
    return NextResponse.json({ error: "進行状況の取得に失敗しました" }, { status: 500 });
  }
}
