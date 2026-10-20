import { NextRequest, NextResponse } from "next/server";
import { careerId } from "@/app/lib/content/career/ids";
import { loadCareerState, saveCareerState } from "@/app/lib/content/career/store";
import { generateCareerWeek } from "@/app/lib/content/career/workflow";
import { careerRequestAllowed } from "@/app/lib/content/career/auth";

export const runtime = "nodejs";
export async function POST(request: NextRequest) {
  if (!(await careerRequestAllowed(request, true))) return NextResponse.json({ error: "AUTH_ORIGIN_DENIED" }, { status: 403 });
  try {
    const body = await request.json();
    const state = loadCareerState();
    const weekStartDate = String(body.weekStartDate ?? "");
    const existing = state.batches.find((batch) => batch.divisionId === "career" && batch.weekStartDate === weekStartDate);
    if (existing) {
      return NextResponse.json({ batch: existing, posts: existing.postIds.map((id) => state.posts.find((post) => post.id === id)).filter(Boolean), idempotent: true });
    }
    const { batch, posts } = generateCareerWeek(state, Array.isArray(body.knowledgeItemIds) ? body.knowledgeItemIds.map(String) : [], weekStartDate);
    state.batches.unshift(batch);
    state.posts.unshift(...posts);
    state.audit.unshift({ id: careerId("career_audit"), divisionId: "career", action: "draft_batch_generated", at: new Date().toISOString(), details: { batchId: batch.id, count: posts.length, publishEnabled: false } });
    saveCareerState(state);
    return NextResponse.json({ batch, posts }, { status: 201 });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "CAREER_GENERATION_FAILED" }, { status: 400 }); }
}
