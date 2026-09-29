import { getProvider } from "@/app/lib/fund/marketData/provider";
import { loadPortfolio } from "@/app/lib/investing/portfolio";
import { loadWatchlist } from "@/app/lib/investing/watchlist";
import { buildOpportunity, deriveMarketRegime } from "./engine";
import { saveIntelligenceToday } from "./store";
import type { IntelligenceFreshness, IntelligenceToday, InvestmentEvidence } from "./types";

function freshnessOf(date: string | null, now: Date): IntelligenceFreshness {
  if (!date) return "unknown";
  const age = now.getTime() - new Date(`${date}T23:59:59Z`).getTime();
  return age <= 2 * 86_400_000 ? "daily" : "stale";
}

export async function runDailyInvestmentResearch(now = new Date()): Promise<IntelligenceToday> {
  const provider = getProvider();
  const [portfolio, watchlist, marketBars] = await Promise.all([
    loadPortfolio(), loadWatchlist(), provider.getDailyBars("SPY", 205),
  ]);
  const marketRegime = deriveMarketRegime(marketBars);
  const marketLast = marketBars?.at(-1) ?? null;
  const marketEvidence: InvestmentEvidence[] = marketLast ? [{
    id: `market_spy_${marketLast.date}`, sourceType: "market", sourceName: provider.name,
    sourceUrl: null, publishedAt: marketLast.date, fetchedAt: now.toISOString(),
    fact: `SPY終値 ${marketLast.close}、出来高 ${marketLast.volume}`, metric: "market_regime",
    value: marketRegime, freshness: freshnessOf(marketLast.date, now),
  }] : [];

  const candidates = new Map<string, { name: string; theme: string; held: boolean }>();
  for (const position of portfolio.positions) {
    if (position.assetClass === "us_stock") candidates.set(position.code.toUpperCase(), { name: position.name, theme: "Portfolio", held: true });
  }
  for (const theme of watchlist.themes) for (const item of theme.items) {
    const ticker = item.ticker.trim().toUpperCase();
    if (ticker && !candidates.has(ticker)) candidates.set(ticker, { name: item.name, theme: theme.theme, held: false });
  }

  const opportunities = await Promise.all([...candidates].slice(0, 30).map(async ([ticker, item]) => {
    const bars = await provider.getDailyBars(ticker, 21);
    const last = bars?.at(-1) ?? null;
    const evidence: InvestmentEvidence[] = last ? [{
      id: `market_${ticker}_${last.date}`, sourceType: "market", sourceName: provider.name,
      sourceUrl: null, publishedAt: last.date, fetchedAt: now.toISOString(),
      fact: `${ticker} 終値 ${last.close}、出来高 ${last.volume}`, metric: "ohlcv",
      value: last.close, freshness: freshnessOf(last.date, now),
    }] : [];
    return buildOpportunity({ ticker, name: item.name, theme: item.theme, bars, marketRegime, held: item.held, evidence, now });
  }));
  opportunities.sort((a, b) => (b.score ?? -1) - (a.score ?? -1));

  const result: IntelligenceToday = {
    asOf: now.toISOString(), marketRegime, marketEvidence,
    sectorStrength: [],
    themeStrength: [...new Set([...candidates.values()].map((item) => item.theme))].map((name) => ({ name, score: null, reason: "Theme横断データの取得待ち" })),
    opportunities,
    portfolioAlerts: opportunities.filter((item) => item.portfolioAction === "RECHECK_THESIS" && (item.relativeVolume ?? 0) >= 2).map((item) => ({ ticker: item.ticker, level: "warning" as const, message: `RVOL ${item.relativeVolume?.toFixed(2)}x。投資仮説を再確認してください` })),
    economicEvents: [], news: [],
    summary: marketRegime === "UNKNOWN" ? "市場データが不十分です。GO候補への昇格は停止しています。" : `市場は${marketRegime}。機会はEvidenceとデータ鮮度を満たした場合のみGO候補になります。`,
  };
  await saveIntelligenceToday(result);
  return result;
}
