/**
 * 楽天証券「資産残高（保有商品）」CSV パーサ & 配分計算
 *
 * 投資部門 Phase 1（docs/11_INVESTMENT_DEPT_PLACEMENT.md 参照）
 * - CSVはクライアント側でShift_JIS→UTF-8デコード済みのテキストを受け取る
 * - ヘッダー名ベースで列を特定するため、列順の変化に強い
 * - 複数セクション（投資信託/米国株式/国内株式）にも対応
 */

export type HoldingCategory = "投資信託" | "米国株式" | "国内株式" | "その他";

export interface Holding {
  category: HoldingCategory;
  name: string;
  code: string;
  quantity: number | null;
  avgCost: number | null;
  currentPrice: number | null;
  marketValueJpy: number | null;
  pnlJpy: number | null;
  pnlPct: number | null;
}

export interface ConcentrationEntry {
  name: string;
  code: string;
  marketValueJpy: number;
  pctOfTotal: number;
  pctOfStocks: number;
}

export interface AllocationSummary {
  totalMarketValueJpy: number;
  fundValueJpy: number;
  stockValueJpy: number;
  otherValueJpy: number;
  fundPct: number;
  stockPct: number;
  targetFundPct: number;
  targetStockPct: number;
  /** 50:50に近づけるため個別株側に必要な追加額（マイナスなら超過） */
  stockShortfallJpy: number;
  /** 個別株の集中度（評価額降順） */
  concentrations: ConcentrationEntry[];
  /** 個別株上位2銘柄の合計比率 */
  top2StocksPctOfStocks: number;
  top2StocksPctOfTotal: number;
  holdingsCount: number;
}

const TARGET_FUND_PCT = 50;
const TARGET_STOCK_PCT = 50;

/** "2,054,100" / "+48.64%" / "921,620円" 等を数値化 */
export function parseNumber(raw: string | undefined): number | null {
  if (!raw) return null;
  const cleaned = raw
    .replace(/[",，、円%％\s]/g, "")
    .replace(/[＋+]/g, "")
    .replace(/[−ー－]/g, "-");
  if (cleaned === "" || cleaned === "-") return null;
  const n = Number(cleaned);
  return Number.isNaN(n) ? null : n;
}

/** クォート対応のCSV1行分割 */
function splitCsvLine(line: string): string[] {
  const cells: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === "," && !inQuotes) {
      cells.push(current.trim());
      current = "";
    } else {
      current += ch;
    }
  }
  cells.push(current.trim());
  return cells;
}

function findColumn(
  headers: string[],
  candidates: string[],
  exclude: string[] = []
): number {
  const ok = (h: string) => !exclude.some((e) => h.includes(e));
  // 完全一致を優先し、次に部分一致（「銘柄」が「銘柄コード」に誤マッチしないように）
  for (const cand of candidates) {
    const idx = headers.findIndex((h) => h === cand && ok(h));
    if (idx !== -1) return idx;
  }
  for (const cand of candidates) {
    const idx = headers.findIndex((h) => h.includes(cand) && ok(h));
    if (idx !== -1) return idx;
  }
  return -1;
}

function classifyCategory(hint: string): HoldingCategory {
  if (hint.includes("投資信託") || hint.includes("投信")) return "投資信託";
  if (hint.includes("米国") || hint.includes("外国株") || hint.includes("海外"))
    return "米国株式";
  if (hint.includes("国内株")) return "国内株式";
  return "その他";
}

function isHeaderLine(cells: string[]): boolean {
  const joined = cells.join("|");
  return (
    joined.includes("銘柄") &&
    (joined.includes("時価評価額") ||
      joined.includes("評価損益") ||
      joined.includes("保有数量"))
  );
}

/**
 * 楽天証券 資産残高CSVをパースして保有商品リストを返す。
 * セクション見出し行（「投資信託」等の単独セル）と「種別」列の両方に対応。
 */
export function parseRakutenAssetCsv(csvText: string): Holding[] {
  const text = csvText.replace(/^﻿/, "");
  const lines = text.split(/\r?\n/);
  const holdings: Holding[] = [];

  let headers: string[] | null = null;
  let col: Record<string, number> = {};
  let sectionHint = "";

  for (const line of lines) {
    if (!line.trim()) {
      headers = null;
      continue;
    }
    const cells = splitCsvLine(line);
    const nonEmpty = cells.filter((c) => c !== "");

    // セクション見出し（例: "米国株式", "投資信託（金額買付）"）
    if (nonEmpty.length === 1 && !isHeaderLine(cells)) {
      const cat = classifyCategory(nonEmpty[0]);
      if (cat !== "その他" || nonEmpty[0].length <= 20) {
        sectionHint = nonEmpty[0];
        headers = null;
      }
      continue;
    }

    if (isHeaderLine(cells)) {
      headers = cells;
      col = {
        category: findColumn(headers, ["種別", "商品"]),
        code: findColumn(headers, ["銘柄コード", "ティッカー", "コード"]),
        name: findColumn(headers, ["銘柄名", "銘柄", "ファンド名"], [
          "コード",
          "ティッカー",
        ]),
        quantity: findColumn(headers, ["保有数量", "数量", "口数"]),
        avgCost: findColumn(headers, ["平均取得価額", "取得価額", "取得単価"]),
        currentPrice: findColumn(headers, ["現在値", "基準価額"]),
        marketValueJpy: findColumn(headers, ["時価評価額[円]", "時価評価額（円）", "時価評価額"]),
        pnlJpy: findColumn(headers, ["評価損益[円]", "評価損益（円）", "評価損益額", "評価損益"]),
        pnlPct: findColumn(headers, ["評価損益[%]", "評価損益（%）", "評価損益率", "損益率"]),
      };
      continue;
    }

    if (!headers) continue;

    const get = (key: string): string | undefined =>
      col[key] >= 0 ? cells[col[key]] : undefined;

    const name = get("name") ?? "";
    const marketValueJpy = parseNumber(get("marketValueJpy"));
    // 銘柄名も評価額も無い行（合計行等）はスキップ
    if (!name || name.includes("合計") || marketValueJpy === null) continue;

    const categoryHint = get("category") || sectionHint;
    holdings.push({
      category: classifyCategory(categoryHint),
      name,
      code: get("code") ?? "",
      quantity: parseNumber(get("quantity")),
      avgCost: parseNumber(get("avgCost")),
      currentPrice: parseNumber(get("currentPrice")),
      marketValueJpy,
      pnlJpy: parseNumber(get("pnlJpy")),
      pnlPct: parseNumber(get("pnlPct")),
    });
  }

  return holdings;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/** 投信 vs 個別株の配分・50:50差分・集中度を計算する */
export function calcAllocation(holdings: Holding[]): AllocationSummary {
  const value = (h: Holding) => h.marketValueJpy ?? 0;
  const total = holdings.reduce((s, h) => s + value(h), 0);

  const fundValue = holdings
    .filter((h) => h.category === "投資信託")
    .reduce((s, h) => s + value(h), 0);
  const stocks = holdings.filter(
    (h) => h.category === "米国株式" || h.category === "国内株式"
  );
  const stockValue = stocks.reduce((s, h) => s + value(h), 0);
  const otherValue = total - fundValue - stockValue;

  const concentrations: ConcentrationEntry[] = stocks
    .map((h) => ({
      name: h.name,
      code: h.code,
      marketValueJpy: value(h),
      pctOfTotal: total > 0 ? round2((value(h) / total) * 100) : 0,
      pctOfStocks: stockValue > 0 ? round2((value(h) / stockValue) * 100) : 0,
    }))
    .sort((a, b) => b.marketValueJpy - a.marketValueJpy);

  const top2 = concentrations.slice(0, 2);

  return {
    totalMarketValueJpy: total,
    fundValueJpy: fundValue,
    stockValueJpy: stockValue,
    otherValueJpy: otherValue,
    fundPct: total > 0 ? round2((fundValue / total) * 100) : 0,
    stockPct: total > 0 ? round2((stockValue / total) * 100) : 0,
    targetFundPct: TARGET_FUND_PCT,
    targetStockPct: TARGET_STOCK_PCT,
    stockShortfallJpy: Math.round(total * (TARGET_STOCK_PCT / 100) - stockValue),
    concentrations,
    top2StocksPctOfStocks: round2(top2.reduce((s, c) => s + c.pctOfStocks, 0)),
    top2StocksPctOfTotal: round2(top2.reduce((s, c) => s + c.pctOfTotal, 0)),
    holdingsCount: holdings.length,
  };
}

const fmtJpy = (n: number | null) =>
  n === null ? "-" : `${n.toLocaleString("ja-JP")}円`;
const fmtNum = (n: number | null) => (n === null ? "-" : n.toLocaleString("ja-JP"));
const fmtPct = (n: number | null) => (n === null ? "-" : `${n}%`);

/**
 * holdings.md（機械生成スナップショット）のMarkdownを生成。
 * 末尾のjsonブロックは /api/fund/allocation が機械的に読み取る。
 */
export function buildHoldingsMarkdown(
  holdings: Holding[],
  summary: AllocationSummary,
  importedAtJst: string
): string {
  const holdingRows = holdings
    .map(
      (h) =>
        `| ${h.category} | ${h.name} | ${h.code || "-"} | ${fmtNum(h.quantity)} | ${fmtNum(
          h.avgCost
        )} | ${fmtJpy(h.marketValueJpy)} | ${fmtJpy(h.pnlJpy)} | ${fmtPct(h.pnlPct)} |`
    )
    .join("\n");

  const concentrationRows = summary.concentrations
    .map(
      (c) =>
        `| ${c.name}${c.code ? `（${c.code}）` : ""} | ${fmtJpy(c.marketValueJpy)} | ${
          c.pctOfTotal
        }% | ${c.pctOfStocks}% |`
    )
    .join("\n");

  const shortfallLabel =
    summary.stockShortfallJpy >= 0
      ? `個別株側の不足額: ${fmtJpy(summary.stockShortfallJpy)}`
      : `個別株側の超過額: ${fmtJpy(-summary.stockShortfallJpy)}`;

  const json = JSON.stringify({ importedAt: importedAtJst, summary, holdings }, null, 2);

  return `---
id: fund-holdings
type: fund_holdings
source: rakuten-csv
updated: ${importedAtJst.slice(0, 10)}
---

# Fund OS — 保有資産スナップショット（楽天証券CSV取込）

最終取込：${importedAtJst}（JST）
このファイルは /api/fund/import により自動生成される。手動編集しないこと。
投資仮説・Conviction等の人間/AI判断は positions.md に記録する。

## 資産サマリー

| 項目 | 金額 | 構成比 |
|---|---:|---:|
| 保有商品合計 | ${fmtJpy(summary.totalMarketValueJpy)} | 100% |
| 投資信託 | ${fmtJpy(summary.fundValueJpy)} | ${summary.fundPct}% |
| 個別株 | ${fmtJpy(summary.stockValueJpy)} | ${summary.stockPct}% |

## 目標配分との差分（投信50 : 個別株50）

- 現在: 投資信託 ${summary.fundPct}% / 個別株 ${summary.stockPct}%
- 目標: 投資信託 ${summary.targetFundPct}% / 個別株 ${summary.targetStockPct}%
- ${shortfallLabel}
- 注意: 不足額の一括購入は行わない。Flow+算出の当月投資可能額の範囲内で段階的に近づける。

## 保有商品一覧

| 種別 | 銘柄 | コード | 保有数量 | 平均取得価額 | 時価評価額[円] | 評価損益[円] | 損益率 |
|---|---|---|---:|---:|---:|---:|---:|
${holdingRows}

## 個別株の集中度

| 銘柄 | 評価額 | 総資産比 | 個別株内比率 |
|---|---:|---:|---:|
${concentrationRows}

- 個別株上位2銘柄の合計: 総資産比 ${summary.top2StocksPctOfTotal}% / 個別株内 ${summary.top2StocksPctOfStocks}%

## 機械読み取り用データ

\`\`\`json
${json}
\`\`\`
`;
}

/** holdings.md 末尾のjsonブロックを取り出す */
export function extractHoldingsJson(markdown: string): {
  importedAt: string;
  summary: AllocationSummary;
  holdings: Holding[];
} | null {
  const match = markdown.match(/```json\s*\n([\s\S]*?)\n```/);
  if (!match) return null;
  try {
    return JSON.parse(match[1]);
  } catch {
    return null;
  }
}
