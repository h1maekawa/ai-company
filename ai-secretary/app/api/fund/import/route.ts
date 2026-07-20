import { NextRequest, NextResponse } from "next/server";
import { saveVaultFile, getVaultFile } from "@/app/lib/vault";
import {
  parseRakutenAssetCsv,
  calcAllocation,
  buildHoldingsMarkdown,
} from "@/app/lib/fund/rakutenCsv";

const HOLDINGS_PATH = "memory/personal/fund/holdings.md";

interface ImportRequest {
  /** Shift_JISからデコード済みのCSVテキスト */
  csvText: string;
}

/**
 * POST /api/fund/import
 * 楽天証券「資産残高」CSVを取込み、memory/personal/fund/holdings.md を再生成する。
 * 認証はmiddleware（セッションCookie）で担保。証券注文は一切行わない。
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const body = (await request.json()) as ImportRequest;

    if (!body.csvText || typeof body.csvText !== "string") {
      return NextResponse.json({ error: "csvText は必須です" }, { status: 400 });
    }

    const holdings = parseRakutenAssetCsv(body.csvText);
    if (holdings.length === 0) {
      return NextResponse.json(
        {
          error:
            "保有商品を1件も読み取れませんでした。楽天証券の資産残高CSV（Shift_JISデコード済み）か確認してください",
        },
        { status: 422 }
      );
    }

    const summary = calcAllocation(holdings);

    const now = new Date();
    const jst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
    const importedAtJst = jst.toISOString().slice(0, 16).replace("T", " ");

    const markdown = buildHoldingsMarkdown(holdings, summary, importedAtJst);

    let existingSha: string | undefined;
    try {
      const existing = await getVaultFile(HOLDINGS_PATH);
      existingSha = existing.sha;
    } catch {
      // 新規作成
    }

    await saveVaultFile(HOLDINGS_PATH, markdown, existingSha);

    return NextResponse.json({
      success: true,
      importedAt: importedAtJst,
      holdingsCount: holdings.length,
      summary,
      holdings,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("[Fund Import API] Error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
