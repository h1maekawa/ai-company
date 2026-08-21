import { NextRequest, NextResponse } from "next/server";
import { loadPerformance, savePerformance } from "@/app/lib/note/research/store";
import type { ContentPerformance } from "@/app/lib/note/research/types";

export async function POST(request: NextRequest): Promise<NextResponse> {
  const body = (await request.json().catch(() => ({}))) as Partial<ContentPerformance>;
  if (!body.contentId || !body.publishedAt || !body.measuredAt) {
    return NextResponse.json({ error: "contentId、publishedAt、measuredAtが必要です" }, { status: 400 });
  }
  const numericFields = ["impressions", "likes", "replies", "reposts", "quotes", "bookmarks", "profileClicks", "followsFromPost", "urlClicks", "noteRevenue", "affiliateRevenue"] as const;
  if (numericFields.some((field) => body[field] !== undefined && (!Number.isFinite(body[field]) || body[field]! < 0))) {
    return NextResponse.json({ error: "指標は0以上の数値で入力してください" }, { status: 400 });
  }
  const file = await loadPerformance();
  const record: ContentPerformance = {
    ...body,
    contentId: body.contentId,
    platform: body.platform ?? "x",
    purpose: body.purpose ?? "reach",
    genreId: body.genreId ?? "daily-thoughts",
    publishedAt: body.publishedAt,
    measuredAt: body.measuredAt,
  };
  file.records = [record, ...file.records].slice(0, 1000);
  await savePerformance(file);
  return NextResponse.json({ record });
}
