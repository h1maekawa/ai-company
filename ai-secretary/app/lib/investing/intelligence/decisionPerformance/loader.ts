import type { DailyBar } from "../../../fund/marketData/calc";
import { getProvider } from "../../../fund/marketData/provider";
import { loadInvestmentDecisions } from "../store";
import { buildDecisionPerformance } from "./build";
import { buildDecisionPerformanceSegments } from "./segments";
import { buildDecisionPerformanceSummary } from "./summary";
import type { DecisionPerformanceReport } from "./types";

/**
 * Read-only loader: reuses the existing Decision Store (loadInvestmentDecisions) and the
 * existing market-data provider. Fetches enough bars (up to 250 trading days past the earliest
 * decision, bounded by what the provider actually returns) per distinct ticker once, then
 * builds each decision's performance from that shared fetch. Never writes anything.
 */
export async function loadDecisionPerformanceReport(now = new Date()): Promise<DecisionPerformanceReport> {
  const records = await loadInvestmentDecisions();
  const provider = getProvider();
  const tickers = [...new Set(records.map((record) => record.ticker).filter((ticker): ticker is string => Boolean(ticker)))];
  const fetched = await Promise.all(tickers.map(async (ticker) => ({ ticker, bars: await provider.getDailyBars(ticker, 250) })));
  const barsByTicker = new Map<string, DailyBar[]>();
  for (const item of fetched) if (item.bars) barsByTicker.set(item.ticker, item.bars);

  const performances = records.map((record) => buildDecisionPerformance(record, record.ticker ? barsByTicker.get(record.ticker) ?? null : null, now));

  return {
    generatedAt: now.toISOString(),
    performances,
    summary: buildDecisionPerformanceSummary(performances),
    segments: buildDecisionPerformanceSegments(performances),
  };
}
