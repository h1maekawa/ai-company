import { NextRequest, NextResponse } from "next/server";
import { claimOnce } from "@/app/lib/note/publishing/queue";
import {
  appendHistory,
  loadNoteQueue,
  loadResearchSettings,
  saveNoteQueue,
} from "@/app/lib/note/research/store";
import { PublishJob } from "@/app/lib/note/research/types";

export const dynamic = "force-dynamic";

/**
 * POST /api/note/publishing/note
 * note公開ジョブを積む。実際の投稿はローカルのPlaywrightランナーが行う。
 *
 * ここでは「人が承認したこと」を記録するだけで、
 * サーバーから直接noteへ投稿することはしない。
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const body = (await req.json()) as {
      articleId?: string;
      kind?: "note-draft" | "note-publish";
      approvedBy?: string;
      idempotencyKey?: string;
    };

    if (!body.articleId) {
      return NextResponse.json({ error: "articleId が必要です" }, { status: 400 });
    }

    const kind = body.kind ?? "note-draft";
    const [queue, settings] = await Promise.all([loadNoteQueue(), loadResearchSettings()]);
    const flags = settings.flags;

    const article = queue.articles.find((a) => a.id === body.articleId);
    if (!article) {
      return NextResponse.json({ error: "その記事が見つかりません" }, { status: 404 });
    }

    if (!flags.publishingEnabled) {
      return NextResponse.json({ error: "投稿が停止中です" }, { status: 423 });
    }

    // 公開は noteAutoPublish かつ noteDraftOnly=false のときだけ
    if (kind === "note-publish") {
      if (!flags.noteAutoPublish || flags.noteDraftOnly) {
        return NextResponse.json(
          { error: "note自動公開はOFFです。下書き保存までしか実行できません" },
          { status: 423 }
        );
      }
      if (article.articleType === "paid" && flags.paidNoteRequireConfirm && article.status !== "approved") {
        return NextResponse.json(
          { error: "有料記事は承認済みでないと公開ジョブを積めません" },
          { status: 422 }
        );
      }
    }

    const key = body.idempotencyKey ?? `note:${article.id}:${kind}`;
    if (!(await claimOnce(key))) {
      return NextResponse.json({ ok: true, deduped: true, message: "既に受付済みです" });
    }

    const now = new Date().toISOString();
    const job: PublishJob = {
      id: `j${Date.now().toString(36)}`,
      kind,
      articleId: article.id,
      status: "pending",
      approvedAt: now,
      approvedBy: body.approvedBy,
      createdAt: now,
    };

    await saveNoteQueue({
      articles: queue.articles.map((a) =>
        a.id === article.id ? { ...a, status: "queued", updatedAt: now } : a
      ),
      jobs: [job, ...queue.jobs],
    });

    await appendHistory({
      id: `h${Date.now().toString(36)}`,
      platform: "note",
      contentId: article.id,
      action: kind === "note-draft" ? "note下書きジョブを登録" : "note公開ジョブを登録",
      at: now,
    });

    return NextResponse.json({ ok: true, job });
  } catch (error) {
    const message = error instanceof Error ? error.message : "ジョブの登録に失敗しました";
    console.error("[api/note/publishing/note] 失敗:", error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
