/**
 * 市場データプロバイダー抽象化（Phase 1.2）
 * docs/12_FUND_POLICY_ENGINE.md §6, §21
 *
 * - 実装はStooq（無料・キー不要・日足OHLCV）をデフォルトとする
 * - bid/ask（スプレッド）は無料日足ソースでは取得不可のため null を返す。
 *   §6.2 により、スプレッド不明の短期銘柄はエンジン側で購入不可となる（仕様どおり）
 * - 取得失敗・データ不足は例外ではなく null / missing で返し、
 *   エンジンの WAIT_DATA 判定に委ねる
 */

import { DailyBar } from "./calc";

export interface MarketDataProvider {
  name: string;
  /** 日足バー（昇順）。取得不可はnull */
  getDailyBars(symbol: string, minBars: number): Promise<DailyBar[] | null>;
  /** USD/JPY為替レート。取得不可はnull */
  getUsdJpy(): Promise<{ rate: number; asOf: string } | null>;
  /** bid/ask。無料ソースでは通常null */
  getQuote(
    symbol: string
  ): Promise<{ bid: number; ask: number; asOf: string } | null>;
}

// ─── インメモリキャッシュ（サーバーレスインスタンス単位） ────

interface CacheEntry<T> {
  value: T;
  fetchedAt: number;
}

const cache = new Map<string, CacheEntry<unknown>>();
const CACHE_TTL_MS = 15 * 60 * 1000; // 15分

async function cached<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const hit = cache.get(key) as CacheEntry<T> | undefined;
  if (hit && Date.now() - hit.fetchedAt < CACHE_TTL_MS) {
    return hit.value;
  }
  const value = await fn();
  if (value !== null) {
    cache.set(key, { value, fetchedAt: Date.now() });
  }
  return value;
}

// ─── Stooq実装 ──────────────────────────────────────────────

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
    // Stooqはシンボル不明時 "No data" 等を返す
    if (!text.toLowerCase().startsWith("date")) return null;
    return text;
  } catch {
    return null;
  }
}

export const stooqProvider: MarketDataProvider = {
  name: "stooq",

  async getDailyBars(symbol, minBars) {
    return cached(`bars:${symbol}`, async () => {
      const csv = await fetchStooqCsv(toStooqSymbol(symbol));
      if (!csv) return null;
      const bars = parseStooqCsv(csv);
      if (!bars || bars.length < minBars) return null;
      // 直近300本に制限（メモリ・キャッシュ節約。200日線判定に十分）
      return bars.slice(-300);
    });
  },

  async getUsdJpy() {
    return cached("fx:usdjpy", async () => {
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
  async getUsdJpy() {
    return null;
  },
  async getQuote() {
    return null;
  },
};

export function getProvider(): MarketDataProvider {
  return process.env.FUND_MARKET_PROVIDER === "null" ? nullProvider : stooqProvider;
}
