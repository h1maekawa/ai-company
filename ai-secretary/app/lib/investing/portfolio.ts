/**
 * 保有ポートフォリオの読み込み。
 *
 * データ元は2つあり、構造化されている方を優先する:
 *   1. holdings.md … 楽天CSV取込のjsonブロック（最も正確）
 *   2. positions.md … 手動更新のMarkdown表（CSV未取込でも実データが入っている）
 * どちらも無ければ空のポートフォリオを返し、UIは「未取込」を表示する。
 */

import { getVaultFile } from "../vault";
import { extractHoldingsJson } from "../fund/rakutenCsv";
import {
  ASSET_CLASS_LABELS,
  AssetClass,
  Portfolio,
  PortfolioSummary,
  Position,
} from "./types";

const HOLDINGS_PATH = "memory/personal/fund/holdings.md";
const POSITIONS_PATH = "memory/personal/fund/positions.md";
const CAPACITY_PATH = "memory/personal/fund/capacity.md";

// ─── 共通ユーティリティ ────────────────────────────────

/** "$97.6084" "+99.6%" "202,585口" "約202.5万円" → number */
function parseNumber(raw: string): number | null {
  const cleaned = raw.replace(/[,¥$円口株%\s]/g, "").replace(/^\+/, "");
  if (!cleaned || cleaned === "-" || cleaned === "—") return null;
  const value = Number(cleaned);
  return Number.isFinite(value) ? value : null;
}

/** Markdownのテーブル行を配列へ。区切り行(---)はスキップ */
function parseTableRows(markdown: string, headerIncludes: string): string[][] {
  const lines = markdown.split("\n");
  const rows: string[][] = [];
  let inTable = false;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("|")) {
      if (inTable) break; // テーブル終了
      continue;
    }
    const cells = trimmed
      .split("|")
      .slice(1, -1)
      .map((c) => c.trim());

    if (!inTable) {
      if (cells.some((c) => c.includes(headerIncludes))) inTable = true;
      continue;
    }
    if (cells.every((c) => /^-*$/.test(c.replace(/:/g, "")))) continue; // 区切り行
    if (cells.length > 1) rows.push(cells);
  }
  return rows;
}

function classifyByCode(code: string): AssetClass {
  if (/^\d{4}$/.test(code)) return "jp_stock";
  return "us_stock";
}

// ─── 1. holdings.md（CSV取込） ─────────────────────────

async function loadFromHoldings(): Promise<Portfolio | null> {
  let data: ReturnType<typeof extractHoldingsJson> = null;
  try {
    const file = await getVaultFile(HOLDINGS_PATH);
    data = extractHoldingsJson(file.content || "");
  } catch {
    return null;
  }
  if (!data || !Array.isArray(data.holdings) || data.holdings.length === 0) return null;

  const positions: Position[] = data.holdings.map((h) => {
    const assetClass: AssetClass =
      h.category === "投資信託"
        ? "fund"
        : h.category === "国内株式"
          ? "jp_stock"
          : h.category === "米国株式"
            ? "us_stock"
            : "other";
    return {
      code: h.code,
      name: h.name,
      assetClass,
      quantity: h.quantity,
      avgCost: h.avgCost,
      currentPrice: h.currentPrice,
      marketValueJpy: h.marketValueJpy,
      pnlJpy: h.pnlJpy,
      pnlPct: h.pnlPct,
      currency: assetClass === "us_stock" ? "USD" : "JPY",
    };
  });

  return {
    positions,
    summary: buildSummary(positions, null),
    source: "holdings_csv",
    updatedAt: data.importedAt ?? null,
  };
}

// ─── 2. positions.md（手動更新の表） ───────────────────

/** 「| Ticker | Entry Price | Current Price | Size (Shares) | PnL (%) | Thesis | Risk | Conviction |」 */
function parseStockTable(markdown: string): Position[] {
  return parseTableRows(markdown, "Ticker")
    .map((cells): Position | null => {
      const code = cells[0]?.replace(/\*/g, "").trim();
      if (!code || code.toLowerCase() === "ticker") return null;

      const avgCost = parseNumber(cells[1] ?? "");
      const currentPrice = parseNumber(cells[2] ?? "");
      const quantity = parseNumber(cells[3] ?? "");
      const pnlPct = parseNumber(cells[4] ?? "");

      return {
        code,
        name: code,
        assetClass: classifyByCode(code),
        quantity,
        avgCost,
        currentPrice,
        // 円換算レートを持たないため、ここでは評価額を確定させない（後段で合計から補完）
        marketValueJpy: null,
        pnlJpy: null,
        pnlPct,
        currency: classifyByCode(code) === "jp_stock" ? "JPY" : "USD",
        thesis: cells[5] || null,
        risk: cells[6] || null,
        conviction: cells[7]?.replace(/\*/g, "").trim() || null,
      };
    })
    .filter((p): p is Position => p !== null);
}

/** 「| 銘柄 | 保有口数 | 取得単価 | 現在値 | 損益率 |」（投信） */
function parseFundTable(markdown: string): Position[] {
  return parseTableRows(markdown, "保有口数")
    .map((cells): Position | null => {
      const name = cells[0]?.trim();
      if (!name || name === "銘柄") return null;
      return {
        code: name.slice(0, 12),
        name,
        assetClass: "fund",
        quantity: parseNumber(cells[1] ?? ""),
        avgCost: parseNumber(cells[2] ?? ""),
        currentPrice: parseNumber(cells[3] ?? ""),
        marketValueJpy: null,
        pnlJpy: null,
        pnlPct: parseNumber(cells[4] ?? ""),
        currency: "JPY",
      };
    })
    .filter((p): p is Position => p !== null);
}

/**
 * 「時価評価額合計：約202.5万円（NVDA 40.9万円 / MU 15.7万円 / ...）」から
 * 銘柄別の評価額（円）と合計を読み取る。
 */
function parseValueBreakdown(markdown: string): {
  totalJpy: number | null;
  totalPnlJpy: number | null;
  byName: Map<string, number>;
} {
  const byName = new Map<string, number>();
  const toYen = (value: number, unit: string) => (unit === "万" ? value * 10_000 : value);

  const totalLine = markdown.match(/時価評価額合計[：:]\s*約?([\d.]+)(万)?円/);
  const totalJpy = totalLine ? toYen(Number(totalLine[1]), totalLine[2] ?? "") : null;

  const pnlLine = markdown.match(/評価損益合計[：:]\s*約?\+?([\d.]+)(万)?円/);
  const totalPnlJpy = pnlLine ? toYen(Number(pnlLine[1]), pnlLine[2] ?? "") : null;

  // 括弧内の「NVDA 40.9万円 / 楽天VTI 91.0万円」を拾う
  const breakdown = markdown.match(/時価評価額合計[^（(]*[（(]([^）)]*)[）)]/);
  if (breakdown) {
    for (const chunk of breakdown[1].split("/")) {
      const m = chunk.trim().match(/^(.+?)\s+([\d.]+)(万)?円$/);
      if (m) byName.set(m[1].trim(), toYen(Number(m[2]), m[3] ?? ""));
    }
  }

  return { totalJpy, totalPnlJpy, byName };
}

async function loadFromPositions(): Promise<Portfolio | null> {
  let markdown = "";
  try {
    const file = await getVaultFile(POSITIONS_PATH);
    markdown = file.content || "";
  } catch {
    return null;
  }
  if (!markdown.trim()) return null;

  const positions = [...parseStockTable(markdown), ...parseFundTable(markdown)];
  if (positions.length === 0) return null;

  // 評価額の内訳を突き合わせる（名前の部分一致で拾う）
  const { totalJpy, totalPnlJpy, byName } = parseValueBreakdown(markdown);
  for (const position of positions) {
    for (const [label, value] of byName) {
      if (position.name.includes(label) || position.code.includes(label) || label.includes(position.code)) {
        position.marketValueJpy = value;
        break;
      }
    }
    // 評価額と損益率が分かれば含み益を逆算できる
    if (position.marketValueJpy !== null && position.pnlPct !== null) {
      const cost = position.marketValueJpy / (1 + position.pnlPct / 100);
      position.pnlJpy = Math.round(position.marketValueJpy - cost);
    }
  }

  const updatedAt = markdown.match(/最終更新[：:]\s*(\d{4}-\d{2}-\d{2})/)?.[1] ?? null;

  return {
    positions,
    summary: buildSummary(positions, { totalJpy, totalPnlJpy }),
    source: "positions_md",
    updatedAt,
  };
}

// ─── サマリー算出 ──────────────────────────────────────

function buildSummary(
  positions: Position[],
  totals: { totalJpy: number | null; totalPnlJpy: number | null } | null
): PortfolioSummary {
  const valued = positions.filter((p) => p.marketValueJpy !== null);
  const summedValue = valued.reduce((sum, p) => sum + (p.marketValueJpy ?? 0), 0);
  const summedPnl = positions.reduce((sum, p) => sum + (p.pnlJpy ?? 0), 0);

  // 明示的な合計値があればそちらを信頼する（内訳に載らない外貨預り金などを含むため）
  const totalValueJpy = totals?.totalJpy ?? (valued.length > 0 ? summedValue : null);
  const totalPnlJpy = totals?.totalPnlJpy ?? (valued.length > 0 ? summedPnl : null);

  const totalPnlPct =
    totalValueJpy !== null && totalPnlJpy !== null && totalValueJpy - totalPnlJpy > 0
      ? (totalPnlJpy / (totalValueJpy - totalPnlJpy)) * 100
      : null;

  // 資産クラス別内訳
  const byClass = new Map<AssetClass, number>();
  for (const position of valued) {
    byClass.set(
      position.assetClass,
      (byClass.get(position.assetClass) ?? 0) + (position.marketValueJpy ?? 0)
    );
  }
  const allocationTotal = [...byClass.values()].reduce((a, b) => a + b, 0);
  const allocation = [...byClass.entries()]
    .map(([assetClass, valueJpy]) => ({
      assetClass,
      label: ASSET_CLASS_LABELS[assetClass],
      valueJpy,
      pct: allocationTotal > 0 ? (valueJpy / allocationTotal) * 100 : 0,
    }))
    .sort((a, b) => b.valueJpy - a.valueJpy);

  return {
    totalValueJpy,
    totalPnlJpy,
    totalPnlPct,
    cashJpy: null, // capacity.md から後で埋める
    todayPnlJpy: null, // 日次スナップショットから後で埋める
    todayPnlPct: null,
    allocation,
  };
}

async function loadCashJpy(): Promise<number | null> {
  try {
    const file = await getVaultFile(CAPACITY_PATH);
    const match = (file.content || "").match(/```json\s*\n([\s\S]*?)\n```/);
    if (!match) return null;
    const data = JSON.parse(match[1]) as { investable_amount?: number | null };
    return typeof data.investable_amount === "number" ? data.investable_amount : null;
  } catch {
    return null;
  }
}

/** ポートフォリオ全体を組み立てて返す（データが無ければ source: "none"） */
export async function loadPortfolio(): Promise<Portfolio> {
  const portfolio = (await loadFromHoldings()) ?? (await loadFromPositions());

  if (!portfolio) {
    return {
      positions: [],
      summary: {
        totalValueJpy: null,
        totalPnlJpy: null,
        totalPnlPct: null,
        cashJpy: await loadCashJpy(),
        todayPnlJpy: null,
        todayPnlPct: null,
        allocation: [],
      },
      source: "none",
      updatedAt: null,
    };
  }

  portfolio.summary.cashJpy = await loadCashJpy();
  return portfolio;
}
