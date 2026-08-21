import { NextRequest, NextResponse } from "next/server";
import { verifyLocalAiWorkerToken } from "@/app/lib/integrations/machine-auth";
import { failLocalAiReviewJob } from "@/app/lib/note/editor/jobs";
import { postToSlack } from "@/app/lib/integrations/slack/blocks";

export const dynamic = "force-dynamic";

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
): Promise<NextResponse> {
  const auth = verifyLocalAiWorkerToken(req);
  if (!auth.ok) return NextResponse.json({ error: auth.reason }, { status: 401 });

  try {
    const body = (await req.json()) as { claimToken?: string; errorCode?: string };
    if (!body.claimToken) {
      return NextResponse.json({ error: "claim tokenがありません" }, { status: 400 });
    }
    const errorCode = String(body.errorCode ?? "LOCAL_AI_FAILED")
      .replace(/[^A-Z0-9_-]/gi, "")
      .slice(0, 80);
    const job = await failLocalAiReviewJob(params.id, body.claimToken, errorCode);
    await postToSlack(
      `Local AIの添削に失敗しました。ジョブは外部公開されていません。（ジョブ: ${job.id} / 原因: ${errorCode}）`
    );
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "失敗報告を保存できませんでした";
    console.error("[local-ai/jobs/fail] failed", {
      errorType: error instanceof Error ? error.name : "unknown",
    });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

