import { NextRequest, NextResponse } from "next/server";
import { loadPortfolio } from "@/app/lib/investing/portfolio";
import { analyzeStock, computeHealth, generateComment } from "@/app/lib/investing/analysis";

export const dynamic = "force-dynamic";

/**
 * GET /api/investing/analysis
 *   健全性スコア（決定的計算）＋ AIコメントを返す。
 * GET /api/investing/analysis?code=NVDA
 *   その銘柄のAI分析を返す。
 */
export async function GET(req: NextRequest): Promise<NextResponse> {
  try {
    const portfolio = await loadPortfolio();
    const code = req.nextUrl.searchParams.get("code");

    if (code) {
      const position = portfolio.positions.find(
        (p) => p.code.toUpperCase() === code.toUpperCase()
      );
      if (!position) {
        return NextResponse.json(
          { error: `${code} は保有一覧に見つかりませんでした`, position: null },
          { status: 404 }
        );
      }
      return NextResponse.json({ position, analysis: await analyzeStock(position) });
    }

    const health = computeHealth(portfolio);
    // スコアは即返せるが、AIコメントは失敗しても画面を止めない
    const comment = await generateComment(portfolio, health);

    return NextResponse.json({ health, comment, source: portfolio.source });
  } catch (error) {
    const message = error instanceof Error ? error.message : "分析に失敗しました";
    console.error("[api/investing/analysis] 失敗:", error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
