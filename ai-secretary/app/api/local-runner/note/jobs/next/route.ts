import { NextRequest, NextResponse } from "next/server";
import { verifyRunnerToken } from "@/app/lib/integrations/machine-auth";
import { loadNoteQueue, loadResearchSettings, saveNoteQueue } from "@/app/lib/note/research/store";

export const dynamic = "force-dynamic";

/**
 * GET /api/local-runner/note/jobs/next
 * ローカルのPlaywrightランナーが次のジョブを1件だけ取りに来る。
 *
 * 渡すのは「Slackで承認済み」のジョブだけ。
 * middleware は素通しなので、LOCAL_RUNNER_TOKEN を必ず検証する。
 */
export async function GET(req: NextRequest): Promise<NextResponse> {
  const auth = verifyRunnerToken(req);
  if (!auth.ok) return NextResponse.json({ error: auth.reason }, { status: 401 });

  try {
    const [queue, settings] = await Promise.all([loadNoteQueue(), loadResearchSettings()]);

    if (!settings.flags.publishingEnabled) {
      return NextResponse.json({ job: null, reason: "投稿が停止中です" });
    }

    const job = queue.jobs.find((j) => j.status === "pending" && j.approvedAt);
    if (!job) return NextResponse.json({ job: null });

    // 公開ジョブはフラグが揃っていなければ渡さない
    if (job.kind === "note-publish" && (!settings.flags.noteAutoPublish || settings.flags.noteDraftOnly)) {
      return NextResponse.json({ job: null, reason: "note自動公開がOFFのため公開ジョブは渡しません" });
    }

    const article = queue.articles.find((a) => a.id === job.articleId);
    if (!article) {
      return NextResponse.json({ job: null, reason: "対象の記事が見つかりません" });
    }

    const now = new Date().toISOString();
    await saveNoteQueue({
      ...queue,
      jobs: queue.jobs.map((j) =>
        j.id === job.id ? { ...j, status: "running" as const, startedAt: now } : j
      ),
    });

    return NextResponse.json({
      job: { ...job, status: "running", startedAt: now },
      article,
      // ランナー側の安全装置
      constraints: {
        draftOnly: settings.flags.noteDraftOnly || job.kind === "note-draft",
        requireConfirmForPaid: settings.flags.paidNoteRequireConfirm,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "ジョブの取得に失敗しました";
    console.error("[local-runner/jobs/next] 失敗:", error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
