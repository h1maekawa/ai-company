import { NextRequest, NextResponse } from "next/server";
import { saveVaultFile, getVaultFile } from "@/app/lib/vault";
import {
  parseRakutenAssetCsv,
  calcAllocation,
  buildHoldingsMarkdown,
  extractHoldingsJson,
  type Holding,
} from "@/app/lib/fund/rakutenCsv";

const HOLDINGS_PATH = "memory/personal/fund/holdings.md";

/** 取込前後で何が変わったか（TASK-F4: 取込後の差分ハイライト） */
export type HoldingsDiff = {
  previousImportedAt: string | null;
  added: { name: string; code: string; quantity: number | null }[];
  removed: { name: string; code: string; quantity: number | null }[];
  changed: { name: string; code: string; from: number | null; to: number | null }[];
};

const keyOf = (h: Holding) => `${h.code || ""}|${h.name}`;

/**
 * 保有の差分だけを見る（数量・銘柄）。評価額は表示のたびに再計算するので比較しない。
 * これにより「前回からトレードがあったか」が一目で分かる。
 */
export function diffHoldings(
  previous: Holding[],
  next: Holding[],
  previousImportedAt: string | null
): HoldingsDiff {
  const before = new Map(previous.map((h) => [keyOf(h), h]));
  const after = new Map(next.map((h) => [keyOf(h), h]));

  const added = next
    .filter((h) => !before.has(keyOf(h)))
    .map((h) => ({ name: h.name, code: h.code, quantity: h.quantity }));

  const removed = previous
    .filter((h) => !after.has(keyOf(h)))
    .map((h) => ({ name: h.name, code: h.code, quantity: h.quantity }));

  const changed = next
    .filter((h) => {
      const old = before.get(keyOf(h));
      return old !== undefined && old.quantity !== h.quantity;
    })
    .map((h) => ({
      name: h.name,
      code: h.code,
      from: before.get(keyOf(h))?.quantity ?? null,
      to: h.quantity,
    }));

  return { previousImportedAt, added, removed, changed };
}

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
    let previous: Holding[] = [];
    let previousImportedAt: string | null = null;
    try {
      const existing = await getVaultFile(HOLDINGS_PATH);
      existingSha = existing.sha;
      const parsed = extractHoldingsJson(existing.content || "");
      previous = parsed?.holdings ?? [];
      previousImportedAt = parsed?.importedAt ?? null;
    } catch {
      // 新規作成
    }

    const diff = diffHoldings(previous, holdings, previousImportedAt);

    await saveVaultFile(HOLDINGS_PATH, markdown, existingSha);

    return NextResponse.json({
      success: true,
      importedAt: importedAtJst,
      holdingsCount: holdings.length,
      summary,
      holdings,
      diff,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("[Fund Import API] Error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
