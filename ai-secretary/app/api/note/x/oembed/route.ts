import { NextRequest, NextResponse } from "next/server";
import {
  buildXOEmbedUrl,
  parseXPostUrl,
  sanitizeXOEmbedHtml,
} from "@/app/lib/note/x/urls";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest): Promise<NextResponse> {
  const rawUrl = req.nextUrl.searchParams.get("url") ?? "";
  const theme = req.nextUrl.searchParams.get("theme") === "light" ? "light" : "dark";
  const parsed = parseXPostUrl(rawUrl);
  if (!parsed) return NextResponse.json({ error: "Xの個別ポストURLを入力してください" }, { status: 400 });
  try {
    const response = await fetch(buildXOEmbedUrl(parsed.canonicalUrl, theme), {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(10_000),
      cache: "no-store",
    });
    if (!response.ok) {
      return NextResponse.json({ error: "削除済み・非公開・取得不可のポストです" }, { status: 404 });
    }
    const data = (await response.json()) as { html?: string };
    if (!data.html) throw new Error("埋め込みHTMLがありません");
    return NextResponse.json({ html: sanitizeXOEmbedHtml(data.html), url: parsed.canonicalUrl });
  } catch {
    return NextResponse.json({ error: "X公式埋め込みを取得できませんでした" }, { status: 502 });
  }
}
