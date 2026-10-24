/** Shared freshness policy for quoted prices, bars, and FX observations. */
export const MAX_MARKET_DATA_AGE_DAYS = 7;

export type MarketTimestampFreshness = "FRESH" | "STALE" | "UNKNOWN";

export function classifyMarketTimestamp(
  basisAt: string | null,
  now = new Date()
): MarketTimestampFreshness {
  if (!basisAt) return "UNKNOWN";
  const basisDate = /^\d{4}-\d{2}-\d{2}$/.test(basisAt)
    ? new Date(`${basisAt}T00:00:00+09:00`)
    : new Date(basisAt);
  if (Number.isNaN(basisDate.getTime())) return "UNKNOWN";
  const maxAgeMs = MAX_MARKET_DATA_AGE_DAYS * 24 * 60 * 60 * 1000;
  return now.getTime() - basisDate.getTime() > maxAgeMs ? "STALE" : "FRESH";
}
