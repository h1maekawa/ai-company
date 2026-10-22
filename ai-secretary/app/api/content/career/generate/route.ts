import { NextRequest, NextResponse } from "next/server";
import { careerRequestAllowed } from "@/app/lib/content/career/auth";
import { loadCareerState, saveCareerState } from "@/app/lib/content/career/store";
import { generateCareerWeekWithOllama } from "@/app/lib/content/career/ollamaGenerator";
import { careerId } from "@/app/lib/content/career/ids";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  if (!(await careerRequestAllowed(request, true))) {
    return NextResponse.json({ error: "AUTH_ORIGIN_DENIED" }, { status: 403 });
  }

  try {
    const body = await request.json();
    const state = loadCareerState();
    const weekStartDate = String(body.weekStartDate ?? "");
    const knowledgeItemIds = Array.isArray(body.knowledgeItemIds) ? body.knowledgeItemIds.map(String) : [];

    const existing = state.batches.find((b) => b.divisionId === "career" && b.weekStartDate === weekStartDate);
    if (existing) {
      return NextResponse.json({
        batch: existing,
        posts: existing.postIds.map((id) => state.posts.find((p) => p.id === id)).filter(Boolean),
        idempotent: true,
      });
    }

    const { batch, posts } = await generateCareerWeekWithOllama(state, knowledgeItemIds, weekStartDate);

    state.batches.unshift(batch);
    state.posts.unshift(...posts);
    state.audit.unshift({
      id: careerId("career_audit"),
      divisionId: "career",
      action: "ollama_week_batch_generated",
      at: new Date().toISOString(),
      details: { batchId: batch.id, count: posts.length, model: "qwen3:8b" },
    });

    saveCareerState(state);
    return NextResponse.json({ batch, posts }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "CAREER_OLLAMA_GENERATION_FAILED" }, { status: 400 });
  }
}
