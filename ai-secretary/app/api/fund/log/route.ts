import { NextRequest, NextResponse } from "next/server";
import { saveVaultFile, getVaultFile } from "@/app/lib/vault";

interface FundLogRequest {
  ticker: string;
  action: "buy" | "sell" | "hold" | "review";
  price?: number;
  quantity?: number;
  holdType?: "短期" | "中期" | "長期";
  reason?: string;
  hypothesis?: string;
  targetPrice?: number;
  stopLoss?: number;
  notes?: string;
  // 売却時の振り返り
  exitPrice?: number;
  exitDate?: string;
  result?: "利確" | "損切り" | "保有継続";
  learnings?: string;
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const body = (await request.json()) as FundLogRequest;

    if (!body.ticker || !body.action) {
      return NextResponse.json(
        { error: "ticker と action は必須です" },
        { status: 400 }
      );
    }

    const now = new Date();
    const jst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
    const year = jst.getUTCFullYear();
    const month = String(jst.getUTCMonth() + 1).padStart(2, "0");
    const day = String(jst.getUTCDate()).padStart(2, "0");
    const dateStr = `${year}-${month}-${day}`;

    const ticker = body.ticker.toUpperCase();
    const filePath = `memory/personal/fund/investment-log/${dateStr}-${ticker}.md`;

    // 既存ファイルがあれば追記
    let existingSha: string | undefined;
    let existingContent = "";

    try {
      const existing = await getVaultFile(filePath);
      if (existing.content) {
        existingContent = existing.content;
        existingSha = existing.sha;
      }
    } catch {
      // 新規作成
    }

    const actionLabel: Record<string, string> = {
      buy: "🟢 買い",
      sell: "🔴 売り",
      hold: "🟡 継続保有",
      review: "🔵 評価レビュー",
    };

    let newContent: string;

    if (existingContent) {
      // 追記モード
      const appendBlock = `
---

## 追加記録 — ${actionLabel[body.action]} @ ${dateStr}

| 項目 | 内容 |
|------|------|
| アクション | ${actionLabel[body.action]} |
| 価格 | ${body.price ? `$${body.price}` : "未記入"} |
| 数量 | ${body.quantity ?? "未記入"}株 |
${body.exitPrice ? `| 売却価格 | $${body.exitPrice} |` : ""}
${body.result ? `| 結果 | ${body.result} |` : ""}

${body.reason ? `**根拠**: ${body.reason}` : ""}
${body.notes ? `\n**メモ**: ${body.notes}` : ""}
${body.learnings ? `\n**学習点**: ${body.learnings}` : ""}
`;
      newContent = existingContent.trim() + appendBlock;
    } else {
      // 新規作成モード
      newContent = `---
id: fund-log-${dateStr}-${ticker.toLowerCase()}
type: investment_log
ticker: ${ticker}
action: ${body.action}
date: ${dateStr}
holdType: ${body.holdType ?? "未設定"}
---

# 投資判断ログ — ${ticker} ${actionLabel[body.action]} ${dateStr}

## 基本情報

| 項目 | 内容 |
|------|------|
| 銘柄 | ${ticker} |
| アクション | ${actionLabel[body.action]} |
| 日付 | ${dateStr} |
| エントリー価格 | ${body.price ? `$${body.price}` : "未記入"} |
| 保有数量 | ${body.quantity ?? "未記入"}株 |
| 保有種別 | ${body.holdType ?? "未設定"} |
| 利確目標 | ${body.targetPrice ? `$${body.targetPrice}` : "未設定"} |
| 損切りライン | ${body.stopLoss ? `$${body.stopLoss}` : "未設定"} |

---

## エントリー根拠

${body.reason ?? "（未記録）"}

---

## 仮説

${body.hypothesis ?? "（未記録）"}

---

## 期待値設定

- 利確目標: ${body.targetPrice ? `$${body.targetPrice}` : "未設定"}
- 損切りライン: ${body.stopLoss ? `$${body.stopLoss}` : "未設定"}

---

## メモ

${body.notes ?? "（なし）"}

---

## 振り返り（売却後に記入）

| 項目 | 内容 |
|------|------|
| 売却日 | ${body.exitDate ?? "未売却"} |
| 売却価格 | ${body.exitPrice ? `$${body.exitPrice}` : "-"} |
| 結果 | ${body.result ?? "-"} |

${body.learnings ? `**学習点**: ${body.learnings}` : "（売却後に記録してください）"}
`;
    }

    await saveVaultFile(filePath, newContent, existingSha);

    return NextResponse.json({
      success: true,
      path: filePath,
      ticker,
      action: body.action,
      date: dateStr,
      message: `${ticker} の投資ログを保存しました（${actionLabel[body.action]}）`,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("[Fund Log API] Error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const { searchParams } = new URL(request.url);
    const ticker = searchParams.get("ticker")?.toUpperCase();
    const date = searchParams.get("date");

    if (!ticker && !date) {
      return NextResponse.json(
        { error: "ticker または date を指定してください" },
        { status: 400 }
      );
    }

    const now = new Date();
    const jst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
    const year = jst.getUTCFullYear();
    const month = String(jst.getUTCMonth() + 1).padStart(2, "0");
    const day = String(jst.getUTCDate()).padStart(2, "0");
    const dateStr = date ?? `${year}-${month}-${day}`;
    const targetTicker = ticker ?? "UNKNOWN";

    const filePath = `memory/personal/fund/investment-log/${dateStr}-${targetTicker}.md`;
    const file = await getVaultFile(filePath);

    if (!file.content) {
      return NextResponse.json(
        { error: "ログが見つかりません", path: filePath },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      path: filePath,
      content: file.content,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
