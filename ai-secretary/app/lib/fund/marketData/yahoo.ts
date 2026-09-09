/**
 * Yahoo Finance 市場データプロバイダー
 *
 * 追加の背景（2026-09）:
 *   既定だった Stooq が JavaScript のボット検証を挟むようになり、
 *   サーバーサイドからの CSV 取得が恒常的に失敗するようになった。
 *   検証の回避はしないため、キー不要で日足と直近値の両方が取れる
 *   Yahoo Finance の chart API を既定プロバイダーにする。
 *
 * 取得できるもの:
 *   - 日足OHLCV（RVOL20/ADTV20/ATR14 の計算に使う）
 *   - regularMarketPrice / regularMarketTime（取引所準拠の遅延クオート）
 *   - USD/JPY（USDJPY=X。為替は24時間動くため実質live）
 * bid/ask はこのAPIでは取れないため getQuote は null のまま（仕様どおり）。
 */

import { DailyBar } from "./calc";
import { LastPrice, MarketDataProvider } from "./provider";

const CHART_BASE = "https://query1.finance.yahoo.com/v8/finance/chart";
const USER_AGENT = "Mozilla/5.0 (compatible; ai-company-fund/1.0)";

/**
 * 内部シンボル → Yahooシンボル。
 *   NVDA / nvda.us → NVDA
 *   7203 / 7203.jp → 7203.T
 *   ^SPX           → ^SPX
 */
export function toYahooSymbol(symbol: string): string {
  const s = symbol.trim();
  if (!s) return s;
  if (s.startsWith("^")) return s.toUpperCase();
  if (/=X$/i.test(s)) return s.toUpperCase();

  const lower = s.toLowerCase();
  if (lower.endsWith(".jp")) return `${s.slice(0, -3)}.T`;
  if (lower.endsWith(".us")) return s.slice(0, -3).toUpperCase();
  if (/^\d{4}$/.test(s)) return `${s}.T`; // 国内株の4桁コード
  return s.toUpperCase();
}

interface ChartResult {
  meta?: {
    currency?: string;
    gmtoffset?: number;
    regularMarketPrice?: number;
    regularMarketTime?: number;
    exchangeTimezoneName?: string;
  };
  timestamp?: number[];
  indicators?: {
    quote?: {
      open?: (number | null)[];
      high?: (number | null)[];
      low?: (number | null)[];
      close?: (number | null)[];
      volume?: (number | null)[];
    }[];
    adjclose?: { adjclose?: (number | null)[] }[];
  };
}

async function fetchChart(
  yahooSymbol: string,
  range: string
): Promise<ChartResult | null> {
  const url = `${CHART_BASE}/${encodeURIComponent(
    yahooSymbol
  )}?interval=1d&range=${range}&includePrePost=false`;
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
      cache: "no-store",
    });
    if (!res.ok) return null;
    const json = (await res.json()) as {
      chart?: { result?: ChartResult[] | null; error?: unknown };
    };
    const result = json.chart?.result?.[0];
    return result ?? null;
  } catch {
    return null;
  }
}

/** epoch秒 + 取引所オフセット → 取引所ローカルの YYYY-MM-DD */
function toLocalDate(epochSec: number, gmtOffsetSec: number): string {
  return new Date((epochSec + gmtOffsetSec) * 1000).toISOString().slice(0, 10);
}

/** chart レスポンスを日足バー（昇順）へ。分割調整済みのadjcloseがあれば比率で調整する */
export function parseChartBars(result: ChartResult): DailyBar[] | null {
  const stamps = result.timestamp;
  const quote = result.indicators?.quote?.[0];
  if (!Array.isArray(stamps) || !quote) return null;

  const gmtOffset = result.meta?.gmtoffset ?? 0;
  const adj = result.indicators?.adjclose?.[0]?.adjclose;
  const bars: DailyBar[] = [];

  for (let i = 0; i < stamps.length; i++) {
    const open = quote.open?.[i];
    const high = quote.high?.[i];
    const low = quote.low?.[i];
    const close = quote.close?.[i];
    const volume = quote.volume?.[i];
    if (
      [open, high, low, close].some(
        (n) => typeof n !== "number" || !Number.isFinite(n) || n <= 0
      )
    ) {
      continue; // 休場・欠損日
    }
    // 分割・配当調整（adjclose/close の比率を全値に適用する）
    const adjClose = adj?.[i];
    const ratio =
      typeof adjClose === "number" && Number.isFinite(adjClose) && (close as number) > 0
        ? adjClose / (close as number)
        : 1;

    bars.push({
      date: toLocalDate(stamps[i], gmtOffset),
      open: (open as number) * ratio,
      high: (high as number) * ratio,
      low: (low as number) * ratio,
      close: (close as number) * ratio,
      volume: typeof volume === "number" && Number.isFinite(volume) ? volume : 0,
    });
  }

  return bars.length > 0 ? bars : null;
}

/** chart レスポンスの meta から直近値を取り出す */
export function parseChartLastPrice(result: ChartResult): LastPrice | null {
  const meta = result.meta;
  const price = meta?.regularMarketPrice;
  if (typeof price !== "number" || !Number.isFinite(price) || price <= 0) return null;
  const epoch = meta?.regularMarketTime;
  const asOf =
    typeof epoch === "number" && epoch > 0
      ? new Date(epoch * 1000).toISOString()
      : new Date().toISOString();
  return {
    price,
    currency: (meta?.currency as string | undefined) ?? null,
    asOf,
  };
}

export const yahooProvider: MarketDataProvider = {
  name: "yahoo",

  async getDailyBars(symbol, minBars) {
    // 200日線判定に足りるよう、必要本数に応じてレンジを切り替える
    const range = minBars > 130 ? "2y" : "1y";
    const result = await fetchChart(toYahooSymbol(symbol), range);
    if (!result) return null;
    const bars = parseChartBars(result);
    if (!bars || bars.length < minBars) return null;
    return bars.slice(-300);
  },

  async getLastPrice(symbol) {
    const result = await fetchChart(toYahooSymbol(symbol), "5d");
    if (!result) return null;
    return parseChartLastPrice(result);
  },

  async getUsdJpy() {
    const result = await fetchChart("USDJPY=X", "5d");
    if (!result) return null;
    const last = parseChartLastPrice(result);
    if (!last) return null;
    return { rate: last.price, asOf: last.asOf };
  },

  async getQuote() {
    // chart APIではbid/askを返さない（仕様どおりnull）
    return null;
  },
};
