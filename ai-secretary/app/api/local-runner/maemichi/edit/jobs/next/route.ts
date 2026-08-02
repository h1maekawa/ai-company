import { NextRequest, NextResponse } from "next/server";
import { verifyLocalAiWorkerToken } from "@/app/lib/integrations/machine-auth";
import { getLocalAiEditorConfig } from "@/app/lib/note/editor/config";
import { claimNextLocalAiReviewJob } from "@/app/lib/note/editor/jobs";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest): Promise<NextResponse> {
  const auth = verifyLocalAiWorkerToken(req);
  if (!auth.ok) return NextResponse.json({ error: auth.reason }, { status: 401 });

  try {
    const config = getLocalAiEditorConfig();
    if (!config.enabled) {
      return NextResponse.json({ job: null, reason: "Local AI添削は停止中です" });
    }
    const workerId = req.headers.get("x-worker-id")?.slice(0, 100) || "local-worker";
    const job = await claimNextLocalAiReviewJob(workerId, config.jobTimeoutSeconds);
    return NextResponse.json({ job });
  } catch (error) {
    const message = error instanceof Error ? error.message : "ジョブを取得できませんでした";
    console.error("[local-ai/jobs/next] failed", {
      errorType: error instanceof Error ? error.name : "unknown",
    });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

