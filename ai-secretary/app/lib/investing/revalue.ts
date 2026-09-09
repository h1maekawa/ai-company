/**
 * 保有と評価の分離（TASK-F1 / F2）
 *
 * 設計の核:
 *   保有（コード・数量・取得単価・資産クラス・通貨）は CSV / positions.md を正とし、
 *   評価（現在値・評価額・含み損益）は表示のたびに市場データから計算し直す。
 *   これにより CSV を再取込しなくても株の評価額が動く。
 *
 * 資産クラス別の鮮度ポリシー（TASK-F2）:
 *   jp_stock / us_stock … 取引所準拠の遅延クオート（当日中）または前営業日終値
 *   fund               … 基準価額は1日1回しか出ないため CSV の値を据え置き「日次」表示
 *   為替               … USD/JPY は24時間動くため実質live
 * 取得に失敗した銘柄は CSV の値へフォールバックし、鮮度を "stale"（未更新）にする。
 */

import { DataFreshness, worstFreshness } from "../freshness";
import { getProvider } from "../fund/marketData/provider";
import { AssetClass, Position } from "./types";

/** CSV由来の据え置き値であることを示す出所ラベル */
const CSV_SOURCE = "楽天証券CSV";
const MANUAL_SOURCE = "positions.md";

export interface RevaluationResult {
  positions: Position[];
  /** 円換算に使ったUSD/JPY（取得できなければ null） */
  fx: { rate: number; asOf: string; source: string } | null;
  /** 再評価を実行した時刻（ISO） */
  revaluedAt: string;
  /** 全ポジションを束ねた鮮度（一番古いものに合わせる） */
  freshness: DataFreshness;
  /** 現在値を反映できた銘柄数 / 対象銘柄数 */
  repriced: number;
  repriceable: number;
}

/** 市場データを引けるシンボルへ変換する（引けないクラスは null） */
export function toMarketSymbol(position: Position): string | null {
  const code = position.code?.trim();
  if (!code) return null;
  if (position.assetClass === "jp_stock") {
    return /^\d{4}[A-Z]?$/.test(code) ? `${code}.jp` : null;
  }
  if (position.assetClass === "us_stock") {
    return /^[A-Za-z][A-Za-z.\-]{0,6}$/.test(code) ? code.toUpperCase() : null;
  }
  return null; // 投信・現金・その他は日足ソースを持たない
}

/** YYYY-MM-DD / ISO の値が「今日（JST）」かどうか */
function isTodayJst(asOf: string): boolean {
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  const asOfJst = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(/^\d{4}-\d{2}-\d{2}$/.test(asOf) ? new Date(`${asOf}T00:00:00+09:00`) : new Date(asOf));
  return today === asOfJst;
}

/** CSV/手動の値を据え置く場合の鮮度 */
function fallbackFreshness(
  assetClass: AssetClass,
  source: string,
  importedAt: string | null,
  reason: string | null
): DataFreshness {
  if (assetClass === "fund") {
    return {
      level: "daily",
      asOf: importedAt,
      source,
      note: "基準価額は1日1回（前営業日）更新",
    };
  }
  return { level: "stale", asOf: importedAt, source, note: reason };
}

/**
 * ポジション配列を現在値で再評価する。
 * 元の配列は書き換えず、新しい配列を返す。
 */
export async function revaluePositions(
  positions: Position[],
  options: { source: "holdings_csv" | "positions_md" | "none"; importedAt: string | null }
): Promise<RevaluationResult> {
  const baseSource = options.source === "holdings_csv" ? CSV_SOURCE : MANUAL_SOURCE;
  const revaluedAt = new Date().toISOString();

  const targets = positions.map((p) => ({ position: p, symbol: toMarketSymbol(p) }));
  const repriceable = targets.filter((t) => t.symbol !== null).length;

  if (repriceable === 0) {
    const result = positions.map((p) => ({
      ...p,
      freshness: fallbackFreshness(p.assetClass, baseSource, options.importedAt, null),
    }));
    return {
      positions: result,
      fx: null,
      revaluedAt,
      freshness: {
        level: options.source === "none" ? "none" : "daily",
        asOf: options.importedAt,
        source: baseSource,
        note: "市場データで再評価できる銘柄がありません",
      },
      repriced: 0,
      repriceable: 0,
    };
  }

  const provider = getProvider();
  const needsFx = targets.some((t) => t.symbol && t.position.assetClass === "us_stock");

  const [fxRaw, prices] = await Promise.all([
    needsFx ? provider.getUsdJpy().catch(() => null) : Promise.resolve(null),
    Promise.all(
      targets.map((t) =>
        t.symbol ? provider.getLastPrice(t.symbol).catch(() => null) : Promise.resolve(null)
      )
    ),
  ]);

  const fx = fxRaw ? { ...fxRaw, source: provider.name } : null;
  let repriced = 0;

  const result = targets.map(({ position, symbol }, index) => {
    const last = symbol ? prices[index] : null;

    // 再評価できない（投信・シンボル不明・取得失敗）→ 保有ファイルの値を据え置く
    if (!last) {
      const reason = symbol ? `現在値を取得できず${baseSource}の値を表示中` : null;
      return {
        ...position,
        freshness: fallbackFreshness(position.assetClass, baseSource, options.importedAt, reason),
      };
    }

    // 米国株は円換算に為替が要る。取れなければ据え置く（中途半端な混在を避ける）
    if (position.assetClass === "us_stock" && !fx) {
      return {
        ...position,
        freshness: fallbackFreshness(
          position.assetClass,
          baseSource,
          options.importedAt,
          `USD/JPYを取得できず${baseSource}の値を表示中`
        ),
      };
    }

    const rate = position.assetClass === "us_stock" ? (fx as { rate: number }).rate : 1;
    const quantity = position.quantity;

    // 数量が無いと評価額を作れない。現在値だけ更新する
    const marketValueJpy =
      quantity !== null && Number.isFinite(quantity) ? quantity * last.price * rate : null;

    // 損益率は現地通貨ベース（為替影響を含めない）で出す
    const pnlPct =
      position.avgCost !== null && position.avgCost > 0
        ? (last.price / position.avgCost - 1) * 100
        : position.pnlPct;

    const pnlJpy =
      marketValueJpy !== null && position.avgCost !== null && quantity !== null
        ? marketValueJpy - quantity * position.avgCost * rate
        : null;

    repriced++;

    return {
      ...position,
      currentPrice: last.price,
      marketValueJpy: marketValueJpy ?? position.marketValueJpy,
      pnlJpy: pnlJpy ?? position.pnlJpy,
      pnlPct,
      freshness: {
        level: isTodayJst(last.asOf) ? ("delayed" as const) : ("daily" as const),
        asOf: last.asOf,
        source: provider.name === "null" ? baseSource : "Yahoo Finance",
        note: isTodayJst(last.asOf) ? null : "前営業日の終値",
      },
    };
  });

  const overall = worstFreshness(result.map((p) => p.freshness?.level ?? "none"));

  return {
    positions: result,
    fx,
    revaluedAt,
    freshness: {
      level: overall,
      asOf: revaluedAt,
      source: repriced > 0 ? "Yahoo Finance" : baseSource,
      note:
        repriced < repriceable
          ? `${repriceable - repriced}銘柄は現在値を取得できず${baseSource}の値を表示中`
          : null,
    },
    repriced,
    repriceable,
  };
}
