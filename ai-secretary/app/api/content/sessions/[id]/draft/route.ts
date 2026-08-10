import { NextRequest, NextResponse } from "next/server";
import { generateDraftBody } from "@/app/lib/content/note-studio/interview";
import { saveDraftToObsidian } from "@/app/lib/content/note-studio/obsidianDraft";
import { loadSession, saveSession } from "@/app/lib/content/note-studio/store";
import { loadContentCore } from "@/app/lib/content/core/store";
import { loadNoteQueue, saveNoteQueue } from "@/app/lib/note/research/store";
import { NoteArticleDraft } from "@/app/lib/note/research/types";

export const dynamic = "force-dynamic";

function makeId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
}

/**
 * POST: Outline確定後、下書き本文をAI生成しNote Publish Queueへdraft状態で保存する。
 * Outline承認前に本文完成版を勝手に生成しない（Outline未確定なら400）。
 * AI生成直後は必ず status: "draft"（Publishedにはならない）。
 */
export async function POST(
  _req: NextRequest,
  { params }: { params: { id: string } }
): Promise<NextResponse> {
  try {
    const session = await loadSession(params.id);
    if (!session) return NextResponse.json({ error: "ArticleSessionが見つかりません" }, { status: 404 });
    if (!session.outline) {
      return NextResponse.json({ error: "先にOutlineを確定してください" }, { status: 400 });
    }

    const { materials } = await loadContentCore();
    const summaries = materials
      .filter((m) => session.materialIds.includes(m.id))
      .map((m) => m.summary ?? m.rawContent.slice(0, 200));

    const body = await generateDraftBody(session, summaries);
    const now = new Date().toISOString();
    const draft: NoteArticleDraft = {
      id: session.draftId ?? makeId("draft"),
      title: session.title,
      articleType: "free",
      freeSection: body,
      tags: [],
      affiliateIds: [],
      needsDisclosure: false,
      sourceResearchItemIds: session.researchIds,
      sourceViewpointIds: session.viewpointIds,
      sourceExperienceIds: session.experienceIds,
      status: "draft",
      articleSessionId: session.id,
      materialIds: session.materialIds,
      contentGoal: session.contentGoal,
      offerIds: session.offerIds,
      ctaIds: session.ctaIds,
      createdAt: now,
      updatedAt: now,
    };

    const queue = await loadNoteQueue();
    const articles = draft.id && queue.articles.some((a) => a.id === draft.id)
      ? queue.articles.map((a) => (a.id === draft.id ? draft : a))
      : [draft, ...queue.articles];
    await saveNoteQueue({ ...queue, articles });

    const nextSession = {
      ...session,
      draftId: draft.id,
      stage: "DRAFT" as const,
      updatedAt: new Date().toISOString(),
    };
    await saveSession(nextSession);

    return NextResponse.json({ draft, session: nextSession });
  } catch (error) {
    console.error("[api/content/sessions/:id/draft] POST失敗:", error);
    return NextResponse.json({ error: "Draftの生成に失敗しました" }, { status: 500 });
  }
}

/**
 * PATCH
 *   { title?, body?, action?: "obsidian-save" | "publish-queue" | "approve" }
 * 本文直接編集、Obsidian保存、Publish Queueへの追加、本人承認をここでまとめて扱う。
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
): Promise<NextResponse> {
  try {
    const session = await loadSession(params.id);
    if (!session) return NextResponse.json({ error: "ArticleSessionが見つかりません" }, { status: 404 });
    if (!session.draftId) return NextResponse.json({ error: "Draftがまだありません" }, { status: 400 });

    const queue = await loadNoteQueue();
    const draft = queue.articles.find((a) => a.id === session.draftId);
    if (!draft) return NextResponse.json({ error: "Draftが見つかりません" }, { status: 404 });

    const body = await req.json();
    let nextDraft: NoteArticleDraft = { ...draft, updatedAt: new Date().toISOString() };
    if (typeof body.title === "string") nextDraft.title = body.title;
    if (typeof body.body === "string") nextDraft.freeSection = body.body;
    if (typeof body.valueProposition === "string") nextDraft.valueProposition = body.valueProposition;
    if (typeof body.paidValue === "string") nextDraft.paidValue = body.paidValue;
    if (typeof body.price === "number") nextDraft.price = body.price;
    if (typeof body.articleType === "string") nextDraft.articleType = body.articleType;

    let nextSession = { ...session, updatedAt: new Date().toISOString() };
    let obsidianPath: string | undefined;

    if (body.action === "approve") {
      // 本人操作でのみ approved / REVIEW→APPROVED へ進む
      nextDraft.status = "approved";
      nextSession.stage = "APPROVED";
    }

    const articles = queue.articles.map((a) => (a.id === nextDraft.id ? nextDraft : a));
    await saveNoteQueue({ ...queue, articles });

    if (body.action === "obsidian-save") {
      obsidianPath = await saveDraftToObsidian(nextDraft, session.id);
      nextSession.stage = nextSession.stage === "MATERIAL" ? "REVIEW" : nextSession.stage;
    }
    if (body.action === "publish-queue") {
      // 既にqueueに保存済み（articles配列そのものがQueue）。stageをREVIEWへ進める
      if (nextSession.stage === "DRAFT") nextSession.stage = "REVIEW";
    }

    await saveSession(nextSession);
    return NextResponse.json({ draft: nextDraft, session: nextSession, obsidianPath });
  } catch (error) {
    console.error("[api/content/sessions/:id/draft] PATCH失敗:", error);
    return NextResponse.json({ error: "Draftの更新に失敗しました" }, { status: 500 });
  }
}
