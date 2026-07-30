import { NextRequest, NextResponse } from "next/server";
import { verifyRunnerToken } from "@/app/lib/integrations/machine-auth";
import { postToSlack } from "@/app/lib/integrations/slack/blocks";
import { appendHistory, loadNoteQueue, saveNoteQueue } from "@/app/lib/note/research/store";

export const dynamic = "force-dynamic";

/** POST /api/local-runner/note/jobs/:id/complete — ランナーが成功を報告する */
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
): Promise<NextResponse> {
  const auth = verifyRunnerToken(req);
  if (!auth.ok) return NextResponse.json({ error: auth.reason }, { status: 401 });

  try {
    const body = (await req.json()) as { noteUrl?: string; screenshotPaths?: string[] };
    const queue = await loadNoteQueue();
    const job = queue.jobs.find((j) => j.id === params.id);
    if (!job) return NextResponse.json({ error: "そのジョブが見つかりません" }, { status: 404 });

    const now = new Date().toISOString();
    const saved = await saveNoteQueue({
      articles: queue.articles.map((a) =>
        a.id === job.articleId
          ? {
              ...a,
              // 下書き保存で終わった場合は published にしない
              status: job.kind === "note-publish" ? ("published" as const) : ("draft" as const),
              noteUrl: body.noteUrl ?? a.noteUrl,
              updatedAt: now,
            }
          : a
      ),
      jobs: queue.jobs.map((j) =>
        j.id === job.id
          ? {
              ...j,
              status: "done" as const,
              finishedAt: now,
              resultUrl: body.noteUrl,
              screenshotPaths: body.screenshotPaths,
            }
          : j
      ),
    });

    await appendHistory({
      id: `h${Date.now().toString(36)}`,
      platform: "note",
      contentId: job.articleId,
      action: job.kind === "note-publish" ? "noteへ公開" : "noteへ下書き保存",
      at: now,
      url: body.noteUrl,
    });

    await postToSlack(
      `noteの${job.kind === "note-publish" ? "公開" : "下書き保存"}が完了しました${body.noteUrl ? `\n${body.noteUrl}` : ""}`
    );

    return NextResponse.json({ ok: true, queue: saved });
  } catch (error) {
    const message = error instanceof Error ? error.message : "完了報告に失敗しました";
    console.error("[local-runner/jobs/complete] 失敗:", error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
