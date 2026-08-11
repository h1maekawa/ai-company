import { NextRequest, NextResponse } from "next/server";
import { loadSession, saveSession } from "@/app/lib/content/note-studio/store";
import { appendHistory, loadNoteQueue, saveNoteQueue, loadPublishedContent, savePublishedContent } from "@/app/lib/note/research/store";
import { PublishedContent } from "@/app/lib/content/monetization/types";

export const dynamic = "force-dynamic";

/**
 * POST { url, campaignId? }
 * 本人操作による正式なPublish記録。AI Draftを自動でPublished扱いにはしない
 * （このAPIを本人が明示的に叩いたときだけPublishedContentが作られる）。
 */
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
): Promise<NextResponse> {
  try {
    const session = await loadSession(params.id);
    if (!session) return NextResponse.json({ error: "ArticleSessionが見つかりません" }, { status: 404 });
    if (!session.draftId) return NextResponse.json({ error: "Draftがまだありません" }, { status: 400 });
    if (session.stage !== "APPROVED" && session.stage !== "PUBLISHED") {
      return NextResponse.json({ error: "先にDraftを本人承認してください（APPROVED）" }, { status: 400 });
    }

    const body = await req.json();
    const url = String(body.url ?? "").trim();

    const queue = await loadNoteQueue();
    const draft = queue.articles.find((a) => a.id === session.draftId);
    if (!draft) return NextResponse.json({ error: "Draftが見つかりません" }, { status: 404 });

    const now = new Date().toISOString();
    const published: PublishedContent = {
      id: `pub_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`,
      channel: "note",
      contentId: draft.id,
      draftId: draft.id,
      articleSessionId: session.id,
      title: draft.title,
      bodySummary: draft.freeSection.slice(0, 200),
      url: url || undefined,
      publishedAt: now,
      contentGoal: draft.contentGoal,
      funnelStage: draft.funnelStage,
      offerIds: draft.offerIds ?? [],
      ctaIds: draft.ctaIds ?? [],
      campaignId: body.campaignId,
      status: "published",
    };

    const existingPublished = await loadPublishedContent();
    await savePublishedContent([published, ...existingPublished]);

    await appendHistory({
      id: `hist_${Date.now().toString(36)}`,
      platform: "note",
      contentId: draft.id,
      draftId: draft.id,
      sourceResearchIds: draft.sourceResearchItemIds,
      sourceViewpointIds: draft.sourceViewpointIds,
      sourceExperienceIds: draft.sourceExperienceIds,
      action: "published",
      at: now,
      url: url || undefined,
      publishedContentId: published.id,
    });

    const articles = queue.articles.map((a) => (a.id === draft.id ? { ...a, status: "published" as const, noteUrl: url || a.noteUrl, updatedAt: now } : a));
    await saveNoteQueue({ ...queue, articles });

    const nextSession = { ...session, stage: "PUBLISHED" as const, updatedAt: now };
    await saveSession(nextSession);

    return NextResponse.json({ published, session: nextSession });
  } catch (error) {
    console.error("[api/content/sessions/:id/publish] POST失敗:", error);
    return NextResponse.json({ error: "公開記録の作成に失敗しました" }, { status: 500 });
  }
}
