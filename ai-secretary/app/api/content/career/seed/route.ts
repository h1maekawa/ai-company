import { NextRequest, NextResponse } from "next/server";
import { careerRequestAllowed } from "@/app/lib/content/career/auth";
import { loadCareerState, saveCareerState } from "@/app/lib/content/career/store";
import { seedWeek1Batch } from "@/app/lib/content/career/seedWeek1";
import { careerId } from "@/app/lib/content/career/ids";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  if (!(await careerRequestAllowed(request, true))) {
    return NextResponse.json({ error: "AUTH_ORIGIN_DENIED" }, { status: 403 });
  }

  try {
    const state = loadCareerState();
    const { batch, posts, source, items } = seedWeek1Batch(state);

    // 存在しない場合のみ追加
    if (!state.batches.some((b) => b.id === batch.id)) {
      state.batches.unshift(batch);
      state.posts.unshift(...posts);
      state.sources.unshift(source);
      state.knowledgeItems.unshift(...items);

      state.audit.unshift({
        id: careerId("career_audit"),
        divisionId: "career",
        action: "week1_posts_seeded",
        at: new Date().toISOString(),
        details: { batchId: batch.id, postCount: posts.length },
      });

      saveCareerState(state);
      return NextResponse.json({ success: true, seeded: true, batch, postsCount: posts.length }, { status: 201 });
    }

    return NextResponse.json({ success: true, seeded: false, message: "ALREADY_SEEDED", batch, postsCount: posts.length }, { status: 200 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "SEED_FAILED" }, { status: 500 });
  }
}
