import { NextRequest, NextResponse } from "next/server";
import { composeContent } from "@/app/lib/note/compose";
import { loadAffiliates, loadBrand, loadIdeas } from "@/app/lib/note/store";

export const dynamic = "force-dynamic";

/**
 * POST /api/note/compose
 * ブランディングと登録済みアフィリエイトを前提に、note記事・X投稿・LINE文を生成する。
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const body = (await req.json()) as {
      ideaId?: string;
      title?: string;
      genreId?: string;
      takeaway?: string;
      context?: string;
    };

    const [{ genres, ideas }, brandFile, allLinks] = await Promise.all([
      loadIdeas(),
      loadBrand(),
      loadAffiliates(),
    ]);

    // ネタから起こす場合はその情報を使う
    const idea = body.ideaId ? ideas.find((i) => i.id === body.ideaId) : undefined;
    const title = (idea?.title ?? body.title ?? "").trim();
    if (!title) {
      return NextResponse.json({ error: "タイトルが必要です" }, { status: 400 });
    }

    const genreId = idea?.genreId ?? body.genreId ?? genres[0].id;
    const genre = genres.find((g) => g.id === genreId) ?? genres[0];

    // URL未登録・停止中の案件は渡さない（AIにリンクを作らせないため）
    const affiliates = allLinks.filter(
      (link) => link.active && link.url && link.genreId === genre.id
    );

    const result = await composeContent({
      title,
      genre,
      takeaway: idea?.takeaway ?? body.takeaway,
      context: body.context,
      brand: brandFile.brand,
      channels: brandFile.channels,
      affiliates,
    });

    if (!result) {
      return NextResponse.json({ error: "生成に失敗しました。もう一度お試しください" }, { status: 502 });
    }

    return NextResponse.json({
      ...result,
      title,
      genre,
      availableAffiliates: affiliates.length,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "生成に失敗しました";
    console.error("[api/note/compose] 失敗:", error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
