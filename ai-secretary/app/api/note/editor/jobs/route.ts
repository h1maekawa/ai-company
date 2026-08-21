import { NextRequest, NextResponse } from "next/server";
import { enqueueLocalAiReview } from "@/app/lib/note/editor/create";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const body = (await req.json()) as Record<string, unknown>;
    const job = await enqueueLocalAiReview(body, "web");
    return NextResponse.json({ job: { id: job.id, status: job.status } }, { status: 202 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "添削ジョブを作成できませんでした";
    console.error("[note/editor/jobs] create failed", {
      errorType: error instanceof Error ? error.name : "unknown",
    });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
