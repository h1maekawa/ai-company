/**
 * 銘柄スナップショット組立（Phase 1.2）
 * プロバイダーから取得したバーを計算関数へ通し、エンジン入力（EvaluationInput.market）を作る。
 * データが欠けても例外を投げず null で返し、WAIT_DATA 判定へ委ねる。
 */

import { MarketEnv } from "../policy";
import {
  DailyBar,
  rvol20,
  adtv20,
  atr14,
  changePct,
  marketEnv,
  spreadPct,
} from "./calc";
import { getProvider, MarketCurrency } from "./provider";

export interface MarketSnapshot {
  provider: string;
  env: MarketEnv;
  priceUsd: number | null;
  priceJpy: number | null;
  usdJpy: number | null;
  usdJpyAsOf: string | null;
  usdJpyFetchedAt: string | null;
  usdJpyFreshness: "FRESH" | "STALE" | "UNKNOWN";
  priceAsOf: string | null;
  priceFetchedAt: string | null;
  currency: MarketCurrency;
  priceFreshness: "FRESH" | "STALE" | "UNKNOWN";
  rvol20: number | null;
  adtv20Usd: number | null;
  spreadPct: number | null;
  atr14: number | null;
  changePct: number | null;
  daysToEarnings: number | null;
  missingData: string[];
}

export function convertMarketValue(
  localPrice: number | null,
  currency: MarketCurrency,
  usdJpy: number | null
): { priceUsd: number | null; priceJpy: number | null } {
  if (localPrice === null || !Number.isFinite(localPrice)) return { priceUsd: null, priceJpy: null };
  if (currency === "USD") return { priceUsd: localPrice, priceJpy: usdJpy === null || !Number.isFinite(usdJpy) || usdJpy <= 0 ? null : Math.round(localPrice * usdJpy) };
  if (currency === "JPY") return { priceUsd: usdJpy && usdJpy > 0 ? localPrice / usdJpy : null, priceJpy: localPrice };
  return { priceUsd: null, priceJpy: null };
}

export function classifyPriceFreshness(
  basisAt: string | null,
  now = new Date()
): "FRESH" | "STALE" | "UNKNOWN" {
  if (!basisAt) return "UNKNOWN";
  const basisDate = /^\d{4}-\d{2}-\d{2}$/.test(basisAt)
    ? new Date(`${basisAt}T00:00:00+09:00`)
    : new Date(basisAt);
  if (Number.isNaN(basisDate.getTime())) return "UNKNOWN";
  return now.getTime() - basisDate.getTime() > 7 * 24 * 60 * 60 * 1000 ? "STALE" : "FRESH";
}

export function trustedMarketValues(
  localPrice: number | null,
  currency: MarketCurrency,
  usdJpy: number | null,
  basisAt: string | null,
  now = new Date()
) {
  const freshness = classifyPriceFreshness(basisAt, now);
  const converted = convertMarketValue(localPrice, currency, usdJpy);
  return {
    freshness,
    priceUsd: freshness === "FRESH" ? converted.priceUsd : null,
    priceJpy: freshness === "FRESH" ? converted.priceJpy : null,
  };
}

const MARKET_INDEX_SYMBOL = "SPY";

export async function getMarketSnapshot(ticker: string): Promise<MarketSnapshot> {
  const provider = getProvider();
  const missing: string[] = [];

  const [bars, fx, quote, indexBars] = await Promise.all([
    provider.getDailyBars(ticker, 21),
    provider.getUsdJpy(),
    provider.getQuote(ticker),
    provider.getDailyBars(MARKET_INDEX_SYMBOL, 205),
  ]);

  let priceUsd: number | null = null;
  let priceAsOf: string | null = null;
  let priceFetchedAt: string | null = null;
  let currency: MarketCurrency = "UNKNOWN";
  let priceFreshness: MarketSnapshot["priceFreshness"] = "UNKNOWN";
  let rvol: number | null = null;
  let adtv: number | null = null;
  let atr: number | null = null;
  let chg: number | null = null;

  if (bars && bars.length > 0) {
    const last = bars[bars.length - 1];
    currency = last.currency ?? "UNKNOWN";
    priceAsOf = last.date;
    priceFetchedAt = last.fetchedAt ?? null;
    priceFreshness = classifyPriceFreshness(priceAsOf);
    if (priceFreshness !== "FRESH") missing.push(priceFreshness === "STALE" ? "stale_price" : "unknown_price_time");
    rvol = rvol20(bars);
    adtv = adtv20(bars);
    atr = atr14(bars);
    chg = changePct(bars);
  } else {
    missing.push("price_bars");
  }
  if (rvol === null) missing.push("rvol20");
  if (adtv === null) missing.push("adtv20");

  const usdJpyFreshness = classifyPriceFreshness(fx?.asOf ?? null);
  const usdJpy = fx && usdJpyFreshness === "FRESH" && Number.isFinite(fx.rate) && fx.rate > 0 ? fx.rate : null;
  if (usdJpy === null) missing.push(usdJpyFreshness === "STALE" ? "stale_usd_jpy" : "unknown_usd_jpy");

  const lastClose = bars?.at(-1)?.close ?? null;
  // A known but old price remains visible only through its basis timestamp/status.
  // Do not pass it into a current evaluation as if it were fresh.
  const trusted = trustedMarketValues(lastClose, currency, usdJpy, priceAsOf);
  priceUsd = trusted.priceUsd;
  const priceJpy = trusted.priceJpy;
  if (currency === "UNKNOWN") missing.push("price_currency");
  const adtvLocal = bars ? adtv20(bars) : null;
  const adtvUsd = currency === "USD"
    ? adtvLocal
    : currency === "JPY" && adtvLocal !== null && usdJpy !== null && Number.isFinite(usdJpy) && usdJpy > 0
      ? Math.round(adtvLocal / usdJpy)
      : null;

  const spread =
    quote !== null ? spreadPct(quote.bid, quote.ask) : null;
  if (spread === null) missing.push("spread");

  const env: MarketEnv = indexBars ? marketEnv(indexBars) : "UNKNOWN";
  if (env === "UNKNOWN") missing.push("market_env");

  return {
    provider: provider.name,
    env,
    priceUsd,
    priceJpy,
    usdJpy,
    usdJpyAsOf: fx?.asOf ?? null,
    usdJpyFetchedAt: fx?.fetchedAt ?? null,
    usdJpyFreshness,
    priceAsOf,
    priceFetchedAt,
    currency,
    priceFreshness,
    rvol20: rvol,
    adtv20Usd: adtvUsd,
    spreadPct: spread,
    atr14: atr,
    changePct: chg,
    // 決算日は無料ソースで安定取得できないため Phase 1.2 では手動入力/AI提示に委ねる
    daysToEarnings: null,
    missingData: missing,
  };
}

export type { DailyBar };
