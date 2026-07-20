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
import { getProvider } from "./provider";

export interface MarketSnapshot {
  provider: string;
  env: MarketEnv;
  priceUsd: number | null;
  priceJpy: number | null;
  usdJpy: number | null;
  priceAsOf: string | null;
  rvol20: number | null;
  adtv20Usd: number | null;
  spreadPct: number | null;
  atr14: number | null;
  changePct: number | null;
  daysToEarnings: number | null;
  missingData: string[];
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
  let rvol: number | null = null;
  let adtv: number | null = null;
  let atr: number | null = null;
  let chg: number | null = null;

  if (bars && bars.length > 0) {
    const last = bars[bars.length - 1];
    priceUsd = last.close;
    priceAsOf = last.date;
    rvol = rvol20(bars);
    adtv = adtv20(bars);
    atr = atr14(bars);
    chg = changePct(bars);
  } else {
    missing.push("price_bars");
  }
  if (rvol === null) missing.push("rvol20");
  if (adtv === null) missing.push("adtv20");

  const usdJpy = fx?.rate ?? null;
  if (usdJpy === null) missing.push("usd_jpy");

  const priceJpy =
    priceUsd !== null && usdJpy !== null
      ? Math.round(priceUsd * usdJpy)
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
    priceAsOf,
    rvol20: rvol,
    adtv20Usd: adtv,
    spreadPct: spread,
    atr14: atr,
    changePct: chg,
    // 決算日は無料ソースで安定取得できないため Phase 1.2 では手動入力/AI提示に委ねる
    daysToEarnings: null,
    missingData: missing,
  };
}

export type { DailyBar };
