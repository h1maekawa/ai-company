import { NextResponse } from "next/server";
import { loadReviewFeed } from "@/app/lib/review/feed";

export const dynamic = "force-dynamic";

/** GET /api/review — 全エージェントのレビュー待ちを1つの一覧で返す（要件2） */
export async function GET(): Promise<NextResponse> {
  try {
    return NextResponse.json(await loadReviewFeed());
  } catch (error) {
    console.error("[api/review] GET失敗:", error);
    return NextResponse.json({ error: "レビュー一覧の取得に失敗しました" }, { status: 500 });
  }
}
