/**
 * 市場データ計算（決定論的・純関数）
 * docs/12_FUND_POLICY_ENGINE.md §6, §7
 */

export interface DailyBar {
  /** YYYY-MM-DD */
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

/**
 * §6.1 RVOL20 = 当日出来高 ÷ 過去20営業日の平均出来高（当日は平均へ含めない）
 * bars は日付昇順・分割調整済みを前提とする。
 */
export function rvol20(bars: DailyBar[]): number | null {
  if (bars.length < 21) return null;
  const today = bars[bars.length - 1];
  const past = bars.slice(-21, -1); // 当日を除く直近20本
  const avg = past.reduce((s, b) => s + b.volume, 0) / past.length;
  if (avg <= 0) return null;
  return round2(today.volume / avg);
}

/** §6.1 RVOL帯ラベル */
export function rvolLabel(
  rvol: number,
  bands: { lowMax: number; normalMax: number; elevatedMax: number; highMax: number }
): string {
  if (rvol < bands.lowMax) return "低調";
  if (rvol < bands.normalMax) return "通常";
  if (rvol < bands.elevatedMax) return "増加";
  if (rvol < bands.highMax) return "高い";
  return "異常な注目";
}

/**
 * §6.2 ADTV20 = 過去20営業日の平均終値 × 平均出来高（当日を含む直近20本）
 * 戻り値は銘柄の取引通貨建て（米国株ならUSD）。
 */
export function adtv20(bars: DailyBar[]): number | null {
  if (bars.length < 20) return null;
  const recent = bars.slice(-20);
  const avgClose = recent.reduce((s, b) => s + b.close, 0) / recent.length;
  const avgVolume = recent.reduce((s, b) => s + b.volume, 0) / recent.length;
  return Math.round(avgClose * avgVolume);
}

/**
 * ATR14（Wilder平滑ではなく単純平均TR。§12.1の撤退幅計算用）
 */
export function atr14(bars: DailyBar[]): number | null {
  if (bars.length < 15) return null;
  const recent = bars.slice(-15);
  const trs: number[] = [];
  for (let i = 1; i < recent.length; i++) {
    const prev = recent[i - 1];
    const cur = recent[i];
    const tr = Math.max(
      cur.high - cur.low,
      Math.abs(cur.high - prev.close),
      Math.abs(cur.low - prev.close)
    );
    trs.push(tr);
  }
  return round4(trs.reduce((s, v) => s + v, 0) / trs.length);
}

/** §12.1 短期の撤退幅: 1.5×ATR14を5〜10%へクランプ（現在値に対する%で返す） */
export function shortExitPct(
  price: number,
  atr: number,
  cfg: { atrMult: number; minPct: number; maxPct: number }
): number {
  if (price <= 0) return cfg.maxPct;
  const raw = ((atr * cfg.atrMult) / price) * 100;
  return round2(Math.min(cfg.maxPct, Math.max(cfg.minPct, raw)));
}

/** 当日騰落率%（前日終値比） */
export function changePct(bars: DailyBar[]): number | null {
  if (bars.length < 2) return null;
  const prev = bars[bars.length - 2].close;
  const cur = bars[bars.length - 1].close;
  if (prev <= 0) return null;
  return round2(((cur - prev) / prev) * 100);
}

/** 単純移動平均（直近n本の終値） */
export function sma(bars: DailyBar[], n: number): number | null {
  if (bars.length < n) return null;
  const recent = bars.slice(-n);
  return recent.reduce((s, b) => s + b.close, 0) / n;
}

/**
 * §7 市場環境判定（SPY等の広範指数のバーで判定）
 * RISK_ON: 終値>200日線 かつ 50日線が上向き
 * RISK_OFF: 終値<200日線 かつ 50日線が下向き
 * NEUTRAL: どちらか一方のみ成立
 */
export function marketEnv(
  indexBars: DailyBar[]
): "RISK_ON" | "NEUTRAL" | "RISK_OFF" | "UNKNOWN" {
  if (indexBars.length < 205) return "UNKNOWN";
  const close = indexBars[indexBars.length - 1].close;
  const sma200 = sma(indexBars, 200);
  const sma50now = sma(indexBars, 50);
  const sma50prev = sma(indexBars.slice(0, -5), 50); // 5営業日前の50日線
  if (sma200 === null || sma50now === null || sma50prev === null) return "UNKNOWN";

  const aboveSma200 = close > sma200;
  const sma50Rising = sma50now > sma50prev;

  if (aboveSma200 && sma50Rising) return "RISK_ON";
  if (!aboveSma200 && !sma50Rising) return "RISK_OFF";
  return "NEUTRAL";
}

/** §6.2 spreadPct = (ask - bid) / midpoint × 100 */
export function spreadPct(bid: number, ask: number): number | null {
  if (bid <= 0 || ask <= 0 || ask < bid) return null;
  const mid = (bid + ask) / 2;
  return round4(((ask - bid) / mid) * 100);
}

const round2 = (n: number) => Math.round(n * 100) / 100;
const round4 = (n: number) => Math.round(n * 10000) / 10000;
