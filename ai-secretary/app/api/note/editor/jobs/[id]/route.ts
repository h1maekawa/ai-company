import { NextRequest, NextResponse } from "next/server";
import { getLocalAiReviewJob } from "@/app/lib/note/editor/jobs";

export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
): Promise<NextResponse> {
  try {
    const job = await getLocalAiReviewJob(params.id);
    if (!job) return NextResponse.json({ error: "ジョブが見つかりません" }, { status: 404 });
    return NextResponse.json({ job });
  } catch (error) {
    const message = error instanceof Error ? error.message : "ジョブを取得できませんでした";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

