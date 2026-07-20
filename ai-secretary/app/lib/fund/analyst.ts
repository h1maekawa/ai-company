/**
 * Fund Analyst — 監視ユニバース自動巡回・一次抽出（Phase A）
 *
 * 流れ: ユニバース構築（保有＋テーマ＋監視銘柄）
 *   → 株価・出来高から決定論的にスクリーニングスコアを計算
 *   → ランキングして「今日見るべき銘柄」を返す
 *
 * ここでのスコアは§8の期間別スコア（ファンダ含む）ではなく、
 * 「詳細評価に回す価値があるか」の一次フィルタ。購入判断には使わない。
 * 決算・ニュース・SEC資料の自動調査はPhase B（AI調査）で追加する。
 */

import { FundPolicy, DEFAULT_POLICY, themeOfTicker } from "./policy";
import { DailyBar, rvol20, adtv20, changePct, sma } from "./marketData/calc";
import { Holding } from "./rakutenCsv";

export type AnalystConfig = NonNullable<FundPolicy["analyst"]>;

export function analystConfig(policy: FundPolicy): AnalystConfig {
  return policy.analyst ?? DEFAULT_POLICY.analyst!;
}

export interface ScanResult {
  ticker: string;
  theme: string | null;
  isHeld: boolean;
  priceUsd: number | null;
  priceAsOf: string | null;
  rvol20: number | null;
  adtv20Usd: number | null;
  changePct: number | null;
  /** momentumDays営業日の騰落率% */
  momentumPct: number | null;
  trend: "up" | "weak_up" | "down" | "unknown";
  /** 0〜100の一次抽出スコア */
  screenScore: number;
  /** 注意フラグ（overheated / low_liquidity / theme_over_limit 等） */
  flags: string[];
  subScores: {
    trend: number;
    rvol: number;
    momentum: number;
    liquidity: number;
  };
}

const round1 = (n: number) => Math.round(n * 10) / 10;

/** momentumDays営業日前の終値比騰落率% */
export function momentumPct(bars: DailyBar[], days: number): number | null {
  if (bars.length < days + 1) return null;
  const past = bars[bars.length - 1 - days].close;
  const cur = bars[bars.length - 1].close;
  if (past <= 0) return null;
  return round1(((cur - past) / past) * 100);
}

/**
 * 1銘柄の一次抽出スコアを日足バーから決定論的に計算する。
 * 全ての閾値・配点はポリシー由来（コード直書きなし）。
 */
export function screenTicker(
  ticker: string,
  bars: DailyBar[] | null,
  policy: FundPolicy
): Omit<ScanResult, "theme" | "isHeld"> {
  const cfg = analystConfig(policy);
  const w = cfg.weights;
  const flags: string[] = [];

  const empty = {
    ticker: ticker.toUpperCase(),
    priceUsd: null,
    priceAsOf: null,
    rvol20: null,
    adtv20Usd: null,
    changePct: null,
    momentumPct: null,
    trend: "unknown" as const,
    screenScore: 0,
    subScores: { trend: 0, rvol: 0, momentum: 0, liquidity: 0 },
    flags,
  };

  if (!bars || bars.length < 21) {
    flags.push("no_data");
    return empty;
  }

  const last = bars[bars.length - 1];
  const rvol = rvol20(bars);
  const adtv = adtv20(bars);
  const chg = changePct(bars);
  const mom = momentumPct(bars, cfg.momentumDays);

  // トレンド（50日線・200日線）
  const sma50 = sma(bars, 50);
  const sma200 = sma(bars, 200);
  let trend: ScanResult["trend"] = "unknown";
  let trendScore = 0;
  if (sma50 !== null && sma200 !== null) {
    if (last.close > sma50 && sma50 > sma200) {
      trend = "up";
      trendScore = w.trend;
    } else if (last.close > sma50) {
      trend = "weak_up";
      trendScore = Math.round(w.trend * 0.6);
    } else {
      trend = "down";
      trendScore = 0;
    }
  } else if (sma50 !== null) {
    flags.push("insufficient_history");
    trend = last.close > sma50 ? "weak_up" : "down";
    trendScore = last.close > sma50 ? Math.round(w.trend * 0.4) : 0;
  } else {
    flags.push("insufficient_history");
  }

  // RVOL（§6.1の帯を利用）
  let rvolScore = 0;
  if (rvol === null) {
    flags.push("rvol_unavailable");
  } else if (
    chg !== null &&
    rvol >= policy.rvol.overheatedRvol &&
    chg >= policy.rvol.overheatedChangePct
  ) {
    flags.push("overheated");
    rvolScore = 0;
  } else if (rvol >= policy.rvol.elevatedMax) {
    rvolScore = Math.round(w.rvol * 0.8); // 高い（1.5〜）
  } else if (rvol >= policy.rvol.normalMax) {
    rvolScore = w.rvol; // 増加（1.2〜1.5）が最良
  } else if (rvol >= policy.rvol.lowMax) {
    rvolScore = Math.round(w.rvol * 0.5); // 通常
  } else {
    rvolScore = Math.round(w.rvol * 0.2); // 低調
  }

  // モメンタム（0%以下=0、momentumFullPct%で満点、線形）
  let momentumScore = 0;
  if (mom === null) {
    flags.push("momentum_unavailable");
  } else if (mom > 0) {
    momentumScore = Math.round(
      Math.min(1, mom / cfg.momentumFullPct) * w.momentum
    );
  }

  // 流動性（長期の最低ADTVを基準にする）
  const minAdtv = policy.liquidity.long.minAdtvUsd;
  let liquidityScore = 0;
  if (adtv === null) {
    flags.push("liquidity_unavailable");
  } else if (adtv >= minAdtv * 4) {
    liquidityScore = w.liquidity;
  } else if (adtv >= minAdtv) {
    liquidityScore = Math.round(w.liquidity * 0.7);
  } else {
    flags.push("low_liquidity");
    liquidityScore = 0;
  }

  const screenScore = Math.min(
    100,
    trendScore + rvolScore + momentumScore + liquidityScore
  );

  return {
    ticker: ticker.toUpperCase(),
    priceUsd: last.close,
    priceAsOf: last.date,
    rvol20: rvol,
    adtv20Usd: adtv,
    changePct: chg,
    momentumPct: mom,
    trend,
    screenScore,
    subScores: {
      trend: trendScore,
      rvol: rvolScore,
      momentum: momentumScore,
      liquidity: liquidityScore,
    },
    flags,
  };
}

/**
 * スキャン対象ユニバース = 保有個別株 ∪ ポリシーの全テーマ銘柄 ∪ universeExtra。
 * 全米国株の巡回はデータソース制約上行わない（明示的なユニバース管理）。
 */
export function buildUniverse(
  policy: FundPolicy,
  holdings: Holding[]
): string[] {
  const set = new Set<string>();
  for (const h of holdings) {
    if (
      (h.category === "米国株式" || h.category === "国内株式") &&
      h.code
    ) {
      set.add(h.code.toUpperCase());
    }
  }
  for (const tickers of Object.values(policy.themes)) {
    for (const t of tickers) set.add(t.toUpperCase());
  }
  for (const t of analystConfig(policy).universeExtra) {
    set.add(t.toUpperCase());
  }
  return [...set].sort();
}

/**
 * ホールディングス情報からテーマ超過フラグ等を付与し、スコア降順に並べる。
 */
export function rankResults(
  results: Omit<ScanResult, "theme" | "isHeld">[],
  policy: FundPolicy,
  holdings: Holding[]
): ScanResult[] {
  const stockValue = holdings
    .filter((h) => h.category === "米国株式" || h.category === "国内株式")
    .reduce((s, h) => s + (h.marketValueJpy ?? 0), 0);

  const themeValue: Record<string, number> = {};
  for (const [theme, tickers] of Object.entries(policy.themes)) {
    themeValue[theme] = holdings
      .filter((h) => tickers.includes(h.code.toUpperCase()))
      .reduce((s, h) => s + (h.marketValueJpy ?? 0), 0);
  }

  const heldTickers = new Set(
    holdings.filter((h) => h.code).map((h) => h.code.toUpperCase())
  );

  return results
    .map((r) => {
      const theme = themeOfTicker(policy, r.ticker);
      const flags = [...r.flags];
      if (theme && stockValue > 0) {
        const pct = (themeValue[theme] / stockValue) * 100;
        if (pct > policy.theme.hardLimitPct) {
          flags.push("theme_over_limit");
        } else if (pct >= policy.theme.warningPct) {
          flags.push("theme_warning");
        }
      }
      return { ...r, theme, isHeld: heldTickers.has(r.ticker), flags };
    })
    .sort((a, b) => b.screenScore - a.screenScore);
}
