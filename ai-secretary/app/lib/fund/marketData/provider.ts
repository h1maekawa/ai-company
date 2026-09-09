/**
 * 市場データプロバイダー抽象化（Phase 1.2）
 * docs/12_FUND_POLICY_ENGINE.md §6, §21
 *
 * - 既定は Yahoo Finance（キー不要・日足OHLCV・遅延クオート・USD/JPY）。
 *   Stooq は 2026-09 にJSボット検証が入り、サーバーから取得できなくなったため
 *   フォールバック扱いに降格した（検証の回避は行わない）。
 * - bid/ask（スプレッド）は無料ソースでは取得不可のため null を返す。
 *   §6.2 により、スプレッド不明の短期銘柄はエンジン側で購入不可となる（仕様どおり）
 * - 取得失敗・データ不足は例外ではなく null / missing で返し、
 *   エンジンの WAIT_DATA 判定に委ねる
 */

import { DailyBar } from "./calc";
import { BARS_TTL_MS, QUOTE_TTL_MS, cached } from "./cache";
import { yahooProvider } from "./yahoo";

/** 直近値（遅延クオート）。asOf は取引所が返した約定時刻のISO文字列 */
export interface LastPrice {
  price: number;
  /** 値段の通貨（判別できなければ null） */
  currency: string | null;
  asOf: string;
}

export interface MarketDataProvider {
  name: string;
  /** 日足バー（昇順）。取得不可はnull */
  getDailyBars(symbol: string, minBars: number): Promise<DailyBar[] | null>;
  /** 直近値。取得不可はnull（呼び出し側は日足終値へフォールバックする） */
  getLastPrice(symbol: string): Promise<LastPrice | null>;
  /** USD/JPY為替レート。取得不可はnull */
  getUsdJpy(): Promise<{ rate: number; asOf: string } | null>;
  /** bid/ask。無料ソースでは通常null */
  getQuote(
    symbol: string
  ): Promise<{ bid: number; ask: number; asOf: string } | null>;
}

// ─── Stooq実装（フォールバック） ───────────────────────────

/** Stooqの日足CSV（Date,Open,High,Low,Close,Volume）をパース */
export function parseStooqCsv(csv: string): DailyBar[] | null {
  const lines = csv.trim().split(/\r?\n/);
  if (lines.length < 2 || !lines[0].toLowerCase().startsWith("date")) {
    return null;
  }
  const bars: DailyBar[] = [];
  for (const line of lines.slice(1)) {
    const [date, open, high, low, close, volume] = line.split(",");
    const o = Number(open);
    const h = Number(high);
    const l = Number(low);
    const c = Number(close);
    const v = Number(volume);
    if (!date || [o, h, l, c].some((n) => !Number.isFinite(n) || n <= 0)) continue;
    bars.push({
      date,
      open: o,
      high: h,
      low: l,
      close: c,
      volume: Number.isFinite(v) ? v : 0,
    });
  }
  return bars.length > 0 ? bars : null;
}

/** 米国株ティッカー→Stooqシンボル（例: NVDA → nvda.us） */
function toStooqSymbol(symbol: string): string {
  const s = symbol.toLowerCase();
  if (s.includes(".") || s.startsWith("^")) return s;
  return `${s}.us`;
}

async function fetchStooqCsv(stooqSymbol: string): Promise<string | null> {
  const url = `https://stooq.com/q/d/l/?s=${encodeURIComponent(stooqSymbol)}&i=d`;
  try {
    const res = await fetch(url, { headers: { "User-Agent": "ai-company-fund/1.0" } });
    if (!res.ok) return null;
    const text = await res.text();
    // Stooqはシンボル不明時 "No data"、ボット検証時はHTMLを返す
    if (!text.toLowerCase().startsWith("date")) return null;
    return text;
  } catch {
    return null;
  }
}

export const stooqProvider: MarketDataProvider = {
  name: "stooq",

  async getDailyBars(symbol, minBars) {
    return cached(`stooq:bars:${symbol}`, async () => {
      const csv = await fetchStooqCsv(toStooqSymbol(symbol));
      if (!csv) return null;
      const bars = parseStooqCsv(csv);
      if (!bars || bars.length < minBars) return null;
      // 直近300本に制限（メモリ・キャッシュ節約。200日線判定に十分）
      return bars.slice(-300);
    });
  },

  async getLastPrice(symbol) {
    // 日足しか持たないため、直近終値を「直近値」として返す
    const bars = await stooqProvider.getDailyBars(symbol, 1);
    if (!bars || bars.length === 0) return null;
    const last = bars[bars.length - 1];
    return { price: last.close, currency: null, asOf: last.date };
  },

  async getUsdJpy() {
    return cached("stooq:fx:usdjpy", async () => {
      const csv = await fetchStooqCsv("usdjpy");
      if (!csv) return null;
      const bars = parseStooqCsv(csv);
      if (!bars || bars.length === 0) return null;
      const last = bars[bars.length - 1];
      return { rate: last.close, asOf: last.date };
    });
  },

  async getQuote() {
    // 無料日足ソースではbid/ask取得不可。スプレッドはnull（短期はエンジンが購入不可にする）
    return null;
  },
};

/** テスト・オフライン用: 常にデータ無しを返すプロバイダー（WAIT_DATA経路の確認用） */
export const nullProvider: MarketDataProvider = {
  name: "null",
  async getDailyBars() {
    return null;
  },
  async getLastPrice() {
    return null;
  },
  async getUsdJpy() {
    return null;
  },
  async getQuote() {
    return null;
  },
};

/**
 * 先頭のプロバイダーから順に試し、null を返したら次へ回すチェーン。
 * 1つのソースが落ちてもダッシュボードが「未取得」だけにならないようにする。
 */
export function chainProviders(
  primary: MarketDataProvider,
  fallback: MarketDataProvider
): MarketDataProvider {
  return {
    name: `${primary.name}+${fallback.name}`,
    async getDailyBars(symbol, minBars) {
      return cached(
        `chain:bars:${symbol}:${minBars}`,
        async () =>
          (await primary.getDailyBars(symbol, minBars)) ??
          (await fallback.getDailyBars(symbol, minBars)),
        BARS_TTL_MS
      );
    },
    async getLastPrice(symbol) {
      return cached(
        `chain:last:${symbol}`,
        async () =>
          (await primary.getLastPrice(symbol)) ?? (await fallback.getLastPrice(symbol)),
        QUOTE_TTL_MS
      );
    },
    async getUsdJpy() {
      return cached(
        "chain:fx:usdjpy",
        async () => (await primary.getUsdJpy()) ?? (await fallback.getUsdJpy()),
        QUOTE_TTL_MS
      );
    },
    async getQuote(symbol) {
      return (await primary.getQuote(symbol)) ?? (await fallback.getQuote(symbol));
    },
  };
}

const defaultProvider = chainProviders(yahooProvider, stooqProvider);

export function getProvider(): MarketDataProvider {
  switch (process.env.FUND_MARKET_PROVIDER) {
    case "null":
      return nullProvider;
    case "stooq":
      return stooqProvider;
    case "yahoo":
      return yahooProvider;
    default:
      return defaultProvider;
  }
}
