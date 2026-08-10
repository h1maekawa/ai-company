import { NextRequest, NextResponse } from "next/server";
import { appendHistory, loadPublishedContent, savePublishedContent } from "@/app/lib/note/research/store";
import { PublishedContent } from "@/app/lib/content/monetization/types";

export const dynamic = "force-dynamic";

/** GET: PublishedContent一覧（note/X共通の正式な公開記録。Draftは含まない） */
export async function GET(): Promise<NextResponse> {
  try {
    return NextResponse.json({ published: await loadPublishedContent() });
  } catch (error) {
    console.error("[api/content/published] GET失敗:", error);
    return NextResponse.json({ error: "公開記録の取得に失敗しました" }, { status: 500 });
  }
}

/**
 * POST { channel: "x", contentId, title, url?, contentGoal?, offerIds?, ctaIds?, campaignId? }
 * X単独運用向けの手動Publish記録（Manual First）。noteはArticleSession経由のPublish APIを使う。
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const body = await req.json();
    const channel = body.channel === "x" ? "x" : "note";
    const contentId = String(body.contentId ?? "");
    const title = String(body.title ?? "").trim();
    if (!contentId || !title) {
      return NextResponse.json({ error: "contentId と title が必要です" }, { status: 400 });
    }

    const now = new Date().toISOString();
    const published: PublishedContent = {
      id: `pub_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`,
      channel,
      contentId,
      title,
      bodySummary: body.bodySummary,
      url: body.url || undefined,
      publishedAt: now,
      contentGoal: body.contentGoal,
      funnelStage: body.funnelStage,
      offerIds: body.offerIds ?? [],
      ctaIds: body.ctaIds ?? [],
      campaignId: body.campaignId,
      status: "published",
    };

    const existing = await loadPublishedContent();
    await savePublishedContent([published, ...existing]);
    await appendHistory({
      id: `hist_${Date.now().toString(36)}`,
      platform: channel,
      contentId,
      action: "published",
      at: now,
      url: published.url,
      publishedContentId: published.id,
    });

    return NextResponse.json({ published });
  } catch (error) {
    console.error("[api/content/published] POST失敗:", error);
    return NextResponse.json({ error: "公開記録の作成に失敗しました" }, { status: 500 });
  }
}
