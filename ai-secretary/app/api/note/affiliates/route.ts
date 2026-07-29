import { NextRequest, NextResponse } from "next/server";
import { loadAffiliates, saveAffiliates } from "@/app/lib/note/store";
import { AffiliateLink } from "@/app/lib/note/types";

export const dynamic = "force-dynamic";

/** GET /api/note/affiliates — 登録済みのアフィリエイト案件 */
export async function GET(): Promise<NextResponse> {
  try {
    return NextResponse.json({ links: await loadAffiliates() });
  } catch (error) {
    const message = error instanceof Error ? error.message : "案件の取得に失敗しました";
    console.error("[api/note/affiliates] GET失敗:", error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/** URLは手入力のみ。形式だけ検証し、内容には手を加えない */
function sanitize(value: unknown, index: number): AffiliateLink | null {
  const raw = value as Record<string, unknown>;
  const programName = String(raw.programName ?? "").trim();
  if (!programName) return null;

  const url = String(raw.url ?? "").trim();
  if (url && !/^https?:\/\//.test(url)) return null; // 不正なURLは弾く

  return {
    id: String(raw.id ?? "").trim() || `aff${Date.now().toString(36)}${index}`,
    genreId: String(raw.genreId ?? "").trim(),
    programName,
    serviceName: String(raw.serviceName ?? "").trim(),
    url,
    ctaText: String(raw.ctaText ?? "").trim() || "詳しく見る",
    placement: String(raw.placement ?? "").trim(),
    active: raw.active !== false,
    createdAt: String(raw.createdAt ?? "") || new Date().toISOString(),
  };
}

/** PUT /api/note/affiliates — 一覧をまとめて保存 */
export async function PUT(req: NextRequest): Promise<NextResponse> {
  try {
    const body = (await req.json()) as { links?: unknown };
    if (!Array.isArray(body.links)) {
      return NextResponse.json({ error: "links が必要です" }, { status: 400 });
    }
    const links = body.links
      .map((item, index) => sanitize(item, index))
      .filter((link): link is AffiliateLink => link !== null);

    return NextResponse.json({ links: await saveAffiliates(links) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "案件の保存に失敗しました";
    console.error("[api/note/affiliates] PUT失敗:", error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
