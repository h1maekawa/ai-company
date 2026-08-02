import { NextRequest, NextResponse } from "next/server";
import { verifyLocalAiWorkerToken } from "@/app/lib/integrations/machine-auth";
import {
  completeLocalAiReviewJob,
  failLocalAiReviewJob,
  getLocalAiReviewJob,
} from "@/app/lib/note/editor/jobs";
import { validatePreservation } from "@/app/lib/note/editor/preservation";
import type { LocalAiReviewResult } from "@/app/lib/note/editor/types";
import { localAiReviewBlocks, postToSlack } from "@/app/lib/integrations/slack/blocks";

export const dynamic = "force-dynamic";

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
): Promise<NextResponse> {
  const auth = verifyLocalAiWorkerToken(req);
  if (!auth.ok) return NextResponse.json({ error: auth.reason }, { status: 401 });

  try {
    const body = (await req.json()) as {
      claimToken?: string;
      result?: LocalAiReviewResult;
    };
    if (!body.claimToken || !body.result) {
      return NextResponse.json({ error: "完了データが不足しています" }, { status: 400 });
    }
    const current = await getLocalAiReviewJob(params.id);
    if (!current) return NextResponse.json({ error: "ジョブが見つかりません" }, { status: 404 });
    const issues = validatePreservation(current.input, body.result);
    if (issues.some((issue) => issue.severity === "error")) {
      await failLocalAiReviewJob(params.id, body.claimToken, "PRESERVATION_VIOLATION");
      await postToSlack(
        `Local AI添削を停止しました。元原稿にない数値・URL、または保護表現の変更を検出しました。（ジョブ: ${params.id}）`
      );
      return NextResponse.json(
        { error: "入力保持チェックに失敗しました", issues },
        { status: 422 }
      );
    }

    const job = await completeLocalAiReviewJob(
      params.id,
      body.claimToken,
      body.result
    );
    await postToSlack(
      `Local AIの添削が完了しました。（ジョブ: ${job.id}）`,
      localAiReviewBlocks(job)
    );
    return NextResponse.json({ ok: true, job: { id: job.id, status: job.status } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "完了報告に失敗しました";
    console.error("[local-ai/jobs/complete] failed", {
      errorType: error instanceof Error ? error.name : "unknown",
    });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
