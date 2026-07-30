import { NextRequest, NextResponse } from "next/server";
import { verifyRunnerToken } from "@/app/lib/integrations/machine-auth";
import { postToSlack } from "@/app/lib/integrations/slack/blocks";
import { loadNoteQueue, saveNoteQueue } from "@/app/lib/note/research/store";

export const dynamic = "force-dynamic";

/**
 * POST /api/local-runner/note/jobs/:id/fail
 * ランナーが失敗を報告する。記事本文は絶対に消さない。
 */
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
): Promise<NextResponse> {
  const auth = verifyRunnerToken(req);
  if (!auth.ok) return NextResponse.json({ error: auth.reason }, { status: 401 });

  try {
    const body = (await req.json()) as {
      reason?: string;
      screenshotPaths?: string[];
      /** noteのUI変更を検知した場合。以後の自動実行を止める材料にする */
      uiChanged?: boolean;
    };

    const queue = await loadNoteQueue();
    const job = queue.jobs.find((j) => j.id === params.id);
    if (!job) return NextResponse.json({ error: "そのジョブが見つかりません" }, { status: 404 });

    const now = new Date().toISOString();
    const reason = body.uiChanged
      ? `noteの画面構成が変わった可能性があります: ${body.reason ?? "詳細不明"}`
      : body.reason ?? "詳細不明";

    const saved = await saveNoteQueue({
      // 記事は draft のまま残す（本文を失わせない）
      articles: queue.articles.map((a) =>
        a.id === job.articleId ? { ...a, status: "draft" as const, updatedAt: now } : a
      ),
      jobs: queue.jobs.map((j) =>
        j.id === job.id
          ? {
              ...j,
              status: "failed" as const,
              finishedAt: now,
              failureReason: reason,
              screenshotPaths: body.screenshotPaths,
            }
          : j
      ),
    });

    await postToSlack(
      [
        `noteの投稿に失敗しました（記事の本文は残っています）`,
        `理由: ${reason}`,
        body.uiChanged ? "⚠️ 画面構成の変化を検知したため、確認するまで再実行しないでください。" : "",
      ]
        .filter(Boolean)
        .join("\n")
    );

    return NextResponse.json({ ok: true, queue: saved });
  } catch (error) {
    const message = error instanceof Error ? error.message : "失敗報告に失敗しました";
    console.error("[local-runner/jobs/fail] 失敗:", error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
