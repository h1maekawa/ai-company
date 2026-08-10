import { NextRequest, NextResponse } from "next/server";
import { generateXFromNoteDraft, NOTE_TO_X_CANDIDATE_TYPES } from "@/app/lib/content/x-studio/bridge";
import { loadNoteQueue, loadSocialDrafts, saveSocialDrafts } from "@/app/lib/note/research/store";
import { SocialDraft, XDraftType } from "@/app/lib/note/research/types";

export const dynamic = "force-dynamic";

function makeId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
}

/**
 * POST { draftId, types?, xAccountId?, genreId? }
 * 承認済みnote記事から、単純な要約ではなく複数の切り口でX下書き候補を作る（Note→X）。
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const body = await req.json();
    const draftId = String(body.draftId ?? "");
    if (!draftId) return NextResponse.json({ error: "draftIdを指定してください" }, { status: 400 });

    const queue = await loadNoteQueue();
    const draft = queue.articles.find((a) => a.id === draftId);
    if (!draft) return NextResponse.json({ error: "記事Draftが見つかりません" }, { status: 404 });

    const types: XDraftType[] = Array.isArray(body.types) && body.types.length > 0 ? body.types : NOTE_TO_X_CANDIDATE_TYPES;
    const xAccountId = body.xAccountId ?? "maemichi";
    const genreId = body.genreId ?? "daily-thoughts";
    const now = new Date().toISOString();

    const candidates: SocialDraft[] = [];
    for (const type of types) {
      const text = await generateXFromNoteDraft(draft, type);
      if (!text) continue;
      candidates.push({
        id: makeId("xdraft"),
        xAccountId,
        purpose: "note-bridge",
        genreId,
        text,
        urls: [],
        needsDisclosure: draft.needsDisclosure,
        status: "draft",
        draftType: type,
        materialIds: draft.materialIds,
        sourceNoteArticleId: draft.id,
        contentGoal: draft.contentGoal,
        createdAt: now,
        updatedAt: now,
      });
    }

    const existing = await loadSocialDrafts();
    await saveSocialDrafts([...candidates, ...existing]);

    return NextResponse.json({ candidates });
  } catch (error) {
    console.error("[api/content/x/from-note] POST失敗:", error);
    return NextResponse.json({ error: "X下書きの生成に失敗しました" }, { status: 500 });
  }
}
