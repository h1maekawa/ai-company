import { NextResponse } from "next/server";
import { listCandidates } from "@/app/lib/knowledge/lifecycle";

/**
 * GET /api/knowledge/candidates
 * Weekly Review 用に、Inbox の captured/candidate アイテムを返す。
 */
export async function GET() {
  try {
    const items = await listCandidates();
    return NextResponse.json({ count: items.length, items });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "不明なエラー";
    console.error("Error in GET /api/knowledge/candidates:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
