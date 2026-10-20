import { NextRequest, NextResponse } from "next/server";
import { careerId } from "@/app/lib/content/career/ids";
import { loadCareerState, saveCareerState } from "@/app/lib/content/career/store";
import { ingestCareerText } from "@/app/lib/content/career/workflow";

export const runtime = "nodejs";
export async function GET() {
  try {
    const state = loadCareerState();
    return NextResponse.json({ divisionId: "career", brand: { publicName: "就活攻略ラボ", privacyPolicy: "内部音声・原稿は非公開。公開前に匿名性と事実性を人間が確認。" }, publishEnabled: false, state });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "CAREER_STORE_UNAVAILABLE" }, { status: 503 }); }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    if (body?.action !== "ingest") return NextResponse.json({ error: "UNSUPPORTED_ACTION" }, { status: 400 });
    const state = loadCareerState();
    const { source, items } = ingestCareerText(state, { text: String(body.text ?? ""), title: String(body.title ?? "就活経験"), type: body.type === "note" ? "note" : "transcript" });
    state.sources.unshift(source);
    state.knowledgeItems.unshift(...items);
    state.audit.unshift({ id: careerId("career_audit"), divisionId: "career", action: "source_ingested", at: new Date().toISOString(), details: { sourceId: source.id, itemCount: items.length, contentHash: source.contentHash } });
    saveCareerState(state);
    return NextResponse.json({ source, items }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "CAREER_INGEST_FAILED";
    return NextResponse.json({ error: message }, { status: message === "DUPLICATE_SOURCE" ? 409 : 400 });
  }
}
