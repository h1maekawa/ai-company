import { NextRequest, NextResponse } from "next/server";
import { startGrilling } from "@/app/lib/grill/orchestrator";

/**
 * POST /api/grill/start — Grillingセッション開始（docs/15 D1/D4）
 * body: { topic: string, secretaryId?: string }
 *
 * topicに応じて必要なFact Providerだけを実行し、Design Treeを生成してFrontierを返す。
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const topic = typeof body?.topic === "string" ? body.topic.trim() : "";
    if (!topic) return NextResponse.json({ error: "topic は必須です。" }, { status: 400 });

    const view = await startGrilling({
      topic,
      secretaryId: typeof body?.secretaryId === "string" ? body.secretaryId : undefined,
    });
    return NextResponse.json(view);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "不明なエラー";
    console.error("Error in POST /api/grill/start:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
