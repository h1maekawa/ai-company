import type { DailyBar } from "../../fund/marketData/calc";
import { getProvider } from "../../fund/marketData/provider";
import { loadHistory } from "../history";
import { loadIntelligenceToday } from "../intelligence/store";
import { loadPortfolio } from "../portfolio";
import { buildPortfolioRiskReport } from "./orchestrator";
import type { PortfolioRiskReport } from "./types";
import { valuedPositions } from "./shared";

const MAX_CORRELATION_CANDIDATES = 5;

/**
 * Read-only loader: reuses the existing loadPortfolio/loadIntelligenceToday/loadHistory and the
 * existing market-data provider (same one used by app/lib/investing/intelligence/research.ts)
 * to fetch bars for the correlation calculation. Never writes anything.
 */
export async function loadPortfolioRiskReport(now = new Date()): Promise<PortfolioRiskReport> {
  const [portfolio, today, history] = await Promise.all([loadPortfolio(), loadIntelligenceToday(), loadHistory()]);

  const provider = getProvider();
  const candidates = valuedPositions(portfolio.positions)
    .sort((a, b) => (b.marketValueJpy ?? 0) - (a.marketValueJpy ?? 0))
    .slice(0, MAX_CORRELATION_CANDIDATES);
  const fetched = await Promise.all(candidates.map(async (position) => ({ ticker: position.code, bars: await provider.getDailyBars(position.code, 60) })));
  const correlationBars = new Map<string, DailyBar[]>();
  for (const item of fetched) if (item.bars) correlationBars.set(item.ticker, item.bars);

  return buildPortfolioRiskReport({
    portfolio,
    opportunities: today?.opportunities ?? [],
    research: today?.research,
    history,
    correlationBars,
    now,
  });
}
