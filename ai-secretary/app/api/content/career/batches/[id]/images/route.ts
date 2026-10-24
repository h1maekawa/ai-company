import { NextRequest, NextResponse } from "next/server";
import { careerRequestAllowed } from "@/app/lib/content/career/auth";
import { loadCareerState } from "@/app/lib/content/career/store";
import { assertSafePostId, renderCareerPostImages } from "@/app/lib/content/career/imageRenderer";

export const runtime = "nodejs";

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  if (!(await careerRequestAllowed(request, true))) {
    return NextResponse.json({ error: "AUTH_ORIGIN_DENIED" }, { status: 403 });
  }

  try {
    const { id: batchId } = await context.params;
    assertSafePostId(batchId);

    const state = loadCareerState();
    const batch = state.batches.find((b) => b.id === batchId && b.divisionId === "career");
    if (!batch) {
      return NextResponse.json({ error: "BATCH_NOT_FOUND" }, { status: 404 });
    }

    const igPosts = batch.postIds
      .map((pid) => state.posts.find((p) => p.id === pid && p.divisionId === "career"))
      .filter((p): p is NonNullable<typeof p> => Boolean(p && p.platform === "instagram"));

    if (igPosts.length === 0) {
      return NextResponse.json({ error: "NO_INSTAGRAM_POSTS_IN_BATCH" }, { status: 400 });
    }

    const results = [];
    let successCount = 0;
    let failedCount = 0;

    for (const post of igPosts) {
      const result = await renderCareerPostImages(post);
      if (result.success) {
        successCount += result.images.length;
      } else {
        failedCount += 1;
      }
      results.push(result);
    }

    return NextResponse.json({
      batchId,
      totalPosts: igPosts.length,
      renderedImagesCount: successCount,
      failedPostsCount: failedCount,
      results,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "BATCH_RENDER_FAILED";
    const status = message.includes("PATH_TRAVERSAL") || message.includes("INVALID_POST_ID") ? 400 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
