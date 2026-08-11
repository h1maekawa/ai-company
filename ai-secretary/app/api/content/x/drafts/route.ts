import { NextRequest, NextResponse } from "next/server";
import { callAI } from "@/app/lib/ai/client";
import { loadContentCore } from "@/app/lib/content/core/store";
import { loadSocialDrafts, saveSocialDrafts } from "@/app/lib/note/research/store";
import { SocialDraft, XDraftType } from "@/app/lib/note/research/types";

export const dynamic = "force-dynamic";

function makeId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
}

const X_DRAFT_SYSTEM_PROMPT = `Content Coreの発信材料（Material）から、指定された切り口(type)でXの投稿文を作ってください。
材料に無い事実・体験・数字を作らないでください。出力は投稿文のみ（140字目安）。`;

/**
 * GET: X下書き一覧（Note Studioを経由しない、X単独運用向け）
 * POST { materialId, draftType, manualText?, xAccountId?, genreId? }
 *   manualTextがあれば手動作成（Manual First）。無ければAIが1件生成する。
 */
export async function GET(): Promise<NextResponse> {
  try {
    return NextResponse.json({ drafts: await loadSocialDrafts() });
  } catch (error) {
    console.error("[api/content/x/drafts] GET失敗:", error);
    return NextResponse.json({ error: "X下書きの取得に失敗しました" }, { status: 500 });
  }
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const body = await req.json();
    const materialId = String(body.materialId ?? "");
    const draftType = (body.draftType ?? "opinion") as XDraftType;
    const xAccountId = body.xAccountId ?? "maemichi";
    const genreId = body.genreId ?? "daily-thoughts";

    let text = String(body.manualText ?? "").trim();
    let materialIds: string[] = [];

    if (materialId) {
      const { materials } = await loadContentCore();
      const material = materials.find((m) => m.id === materialId);
      if (!material) return NextResponse.json({ error: "Materialが見つかりません" }, { status: 404 });
      materialIds = [materialId];

      if (!text) {
        const message = `切り口(type): ${draftType}\n\n材料: ${material.title}\n${material.summary ?? material.rawContent.slice(0, 1000)}`;
        text = (await callAI(message, X_DRAFT_SYSTEM_PROMPT, { provider: "auto" })).trim();
      }
    }

    if (!text) return NextResponse.json({ error: "manualText か materialId を指定してください" }, { status: 400 });

    const now = new Date().toISOString();
    const draft: SocialDraft = {
      id: makeId("xdraft"),
      xAccountId,
      purpose: "reach",
      genreId,
      text,
      urls: [],
      needsDisclosure: false,
      status: "draft",
      draftType,
      materialIds,
      createdAt: now,
      updatedAt: now,
    };

    const existing = await loadSocialDrafts();
    await saveSocialDrafts([draft, ...existing]);
    return NextResponse.json({ draft });
  } catch (error) {
    console.error("[api/content/x/drafts] POST失敗:", error);
    return NextResponse.json({ error: "X下書きの作成に失敗しました" }, { status: 500 });
  }
}

/** PATCH { id, text?, status? }: 本人編集・承認 */
export async function PATCH(req: NextRequest): Promise<NextResponse> {
  try {
    const body = await req.json();
    const id = String(body.id ?? "");
    if (!id) return NextResponse.json({ error: "idを指定してください" }, { status: 400 });

    const drafts = await loadSocialDrafts();
    const target = drafts.find((d) => d.id === id);
    if (!target) return NextResponse.json({ error: "X下書きが見つかりません" }, { status: 404 });

    const next: SocialDraft = { ...target, updatedAt: new Date().toISOString() };
    if (typeof body.text === "string") next.text = body.text;
    if (typeof body.status === "string") next.status = body.status;
    if (Array.isArray(body.offerIds)) next.offerIds = body.offerIds;
    if (Array.isArray(body.ctaIds)) next.ctaIds = body.ctaIds;
    if (typeof body.contentGoal === "string") next.contentGoal = body.contentGoal;

    await saveSocialDrafts(drafts.map((d) => (d.id === id ? next : d)));
    return NextResponse.json({ draft: next });
  } catch (error) {
    console.error("[api/content/x/drafts] PATCH失敗:", error);
    return NextResponse.json({ error: "X下書きの更新に失敗しました" }, { status: 500 });
  }
}
