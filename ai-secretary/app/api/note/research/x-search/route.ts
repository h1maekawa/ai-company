import { NextRequest, NextResponse } from "next/server";
import { normalizeXQuery } from "@/app/lib/note/research/x-query";
import { extractTrendKeywords } from "@/app/lib/note/research/x-trends";

export const dynamic = "force-dynamic";

type CountBucket = { start?: string; end?: string; tweet_count?: number };

export async function POST(request: NextRequest): Promise<NextResponse> {
  const body = (await request.json().catch(() => ({}))) as { query?: string; maxResults?: number };
  const query = normalizeXQuery(body.query ?? "");
  if (!query) return NextResponse.json({ error: "queryが必要です" }, { status: 400 });
  if (process.env.X_API_ENABLED !== "true" || !process.env.X_API_BEARER_TOKEN) {
    return NextResponse.json({
      query,
      posts: [],
      skippedReason: "X APIが未設定です。テーマ入力とnote等の無料ソースで作成を続けられます。",
    });
  }

  const maxResults = Math.max(10, Math.min(body.maxResults ?? 25, 100));
  const headers = { Authorization: `Bearer ${process.env.X_API_BEARER_TOKEN}` };
  try {
    const [postsResponse, countsResponse] = await Promise.all([
      fetch(`https://api.x.com/2/tweets/search/recent?query=${encodeURIComponent(query)}&max_results=${maxResults}&tweet.fields=created_at,public_metrics`, { headers }),
      fetch(`https://api.x.com/2/tweets/counts/recent?query=${encodeURIComponent(query)}&granularity=day`, { headers }),
    ]);
    if (!postsResponse.ok) {
      return NextResponse.json({ error: `X検索に失敗しました（HTTP ${postsResponse.status}）` }, { status: postsResponse.status });
    }
    const posts = (await postsResponse.json()) as { data?: { text?: string }[] };
    const countJson = countsResponse.ok
      ? (await countsResponse.json()) as { data?: CountBucket[] }
      : { data: [] };
    const buckets = countJson.data ?? [];
    const currentCount = buckets.at(-1)?.tweet_count;
    const previousCount = buckets.at(-2)?.tweet_count;
    const growthRate =
      currentCount !== undefined && previousCount
        ? (currentCount - previousCount) / previousCount
        : undefined;
    return NextResponse.json({
      query,
      posts: posts.data ?? [],
      trendKeywords: extractTrendKeywords((posts.data ?? []).flatMap((post) => post.text ? [post.text] : [])),
      counts: { currentCount, previousCount, growthRate },
      fetchedAt: new Date().toISOString(),
    });
  } catch {
    return NextResponse.json({ error: "X APIへ接続できませんでした" }, { status: 502 });
  }
}
