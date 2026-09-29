import { getProvider } from "@/app/lib/fund/marketData/provider";
import { loadPortfolio } from "@/app/lib/investing/portfolio";
import { loadWatchlist } from "@/app/lib/investing/watchlist";
import { buildOpportunity, deriveMarketRegime } from "./engine";
import { investmentIntelligenceEnabled } from "./flags";
import { tokyoDateKey } from "@/app/lib/note/tokyoDate";
import { fetchEconomicNews } from "./providers/economicNews";
import { loadMacroSnapshot } from "./providers/macro";
import { fetchSecFundamentals, fetchSecTickerMap } from "./providers/sec";
import { loadSectorSnapshots } from "./providers/sector";
import { saveIntelligenceToday } from "./store";
import type { IntelligenceFreshness, IntelligenceToday, InvestmentEvidence, ProviderStatus } from "./types";

function freshnessOf(date: string | null, now: Date): IntelligenceFreshness { if (!date) return "unknown"; return now.getTime() - new Date(`${date}T23:59:59Z`).getTime() <= 4 * 86_400_000 ? "daily" : "stale"; }
export { investmentIntelligenceEnabled } from "./flags";

export async function runDailyInvestmentResearch(now = new Date()): Promise<IntelligenceToday> {
  const provider = getProvider();
  const [portfolio, watchlist, spyBars, nasdaqBars, soxBars, vixBars, macroResult, newsResult, sectors, cikMap] = await Promise.all([loadPortfolio(), loadWatchlist(), provider.getDailyBars("SPY", 205), provider.getDailyBars("QQQ", 205), provider.getDailyBars("^SOX", 205), provider.getDailyBars("^VIX", 21), loadMacroSnapshot(now), fetchEconomicNews(), loadSectorSnapshots(now), fetchSecTickerMap()]);
  const marketRegimeDetail = deriveMarketRegime({ spy: spyBars, nasdaq: nasdaqBars, sox: soxBars, vix: vixBars, macro: macroResult.macro, now }); const marketRegime = marketRegimeDetail.regime; const marketLast = spyBars?.at(-1) ?? null;
  const marketEvidence: InvestmentEvidence[] = marketLast ? [{ id: `market_spy_${marketLast.date}`, sourceType: "market", sourceName: provider.name, sourceUrl: null, publishedAt: marketLast.date, fetchedAt: now.toISOString(), fact: `SPY終値 ${marketLast.close}、出来高 ${marketLast.volume}`, metric: "market_regime", value: marketRegime, freshness: freshnessOf(marketLast.date, now) }] : [];
  const candidates = new Map<string, { name: string; theme: string; held: boolean }>();
  for (const position of portfolio.positions) if (position.assetClass === "us_stock") candidates.set(position.code.toUpperCase(), { name: position.name, theme: "Portfolio", held: true });
  for (const theme of watchlist.themes) for (const item of theme.items) { const ticker = item.ticker.trim().toUpperCase(); if (ticker && !candidates.has(ticker)) candidates.set(ticker, { name: item.name, theme: theme.theme, held: false }); }
  let secOk = 0; let secErrors = 0;
  const opportunities = await Promise.all([...candidates].slice(0, 30).map(async ([ticker, item]) => {
    const [bars, fundamentalResult] = await Promise.all([provider.getDailyBars(ticker, 30), fetchSecFundamentals(ticker, cikMap.get(ticker) ?? null)]);
    if (fundamentalResult.status === "OK") secOk++; else if (fundamentalResult.status === "ERROR") secErrors++;
    const last = bars?.at(-1) ?? null; const evidence: InvestmentEvidence[] = [];
    if (last) evidence.push({ id: `market_${ticker}_${last.date}`, sourceType: "market", sourceName: provider.name, sourceUrl: null, publishedAt: last.date, fetchedAt: now.toISOString(), fact: `${ticker} 終値 ${last.close}、出来高 ${last.volume}`, metric: "ohlcv", value: last.close, freshness: freshnessOf(last.date, now) });
    if (fundamentalResult.data.sourceUrl) evidence.push({ id: `sec_${ticker}_${fundamentalResult.data.observedAt}`, sourceType: "research", sourceName: "SEC EDGAR", sourceUrl: fundamentalResult.data.sourceUrl, publishedAt: fundamentalResult.data.observedAt, fetchedAt: now.toISOString(), fact: `${ticker} revenue ${fundamentalResult.data.revenue ?? "unknown"}, FCF ${fundamentalResult.data.fcf ?? "unknown"}`, metric: "fundamentals", value: fundamentalResult.data.revenue, freshness: fundamentalResult.data.freshness });
    const relatedNews = newsResult.items.filter((entry) => entry.relatedTickers.includes(ticker) || entry.relatedThemes.some((theme) => item.theme.toLowerCase().includes(theme.toLowerCase()) || theme.toLowerCase().includes(item.theme.toLowerCase()))).map<InvestmentEvidence>((entry) => ({ id: entry.id, sourceType: "news", sourceName: entry.source, sourceUrl: entry.url, publishedAt: entry.publishedAt, fetchedAt: entry.fetchedAt, fact: entry.factSummary, metric: "catalyst", value: entry.impact, freshness: entry.freshness }));
    const sector = sectors.find((entry) => entry.name.toLowerCase().includes(item.theme.toLowerCase()) || item.theme.toLowerCase().includes(entry.name.toLowerCase()));
    return buildOpportunity({ ticker, name: item.name, theme: item.theme, bars, marketRegime, held: item.held, evidence: [...evidence, ...relatedNews], fundamental: fundamentalResult.data, sector, now });
  }));
  opportunities.sort((a, b) => (b.score ?? -1) - (a.score ?? -1));
  const providerStatus: ProviderStatus[] = [...macroResult.statuses, { provider: "SerpAPI", status: newsResult.status, checkedAt: now.toISOString() }, { provider: "SEC", status: !process.env.SEC_USER_AGENT ? "NOT_CONFIGURED" : secErrors > 0 && secOk === 0 ? "ERROR" : "OK", checkedAt: now.toISOString(), detail: `${secOk} symbols loaded` }];
  const result: IntelligenceToday = { asOf: now.toISOString(), runId: `investment-${tokyoDateKey(now)}`, marketRegime, marketRegimeDetail, marketEvidence, macro: macroResult.macro, economicNews: newsResult.items, sectors, providerStatus,
    sectorStrength: sectors.map((item) => ({ name: item.name, score: item.score, reason: item.score === null ? "市場データ未取得" : `${item.proxy}: 20日momentum ${item.momentum20d?.toFixed(1) ?? "—"}%` })),
    themeStrength: [...new Set([...candidates.values()].map((item) => item.theme))].map((name) => ({ name, score: null, reason: "個別Evidenceを優先して判定" })), opportunities,
    portfolioAlerts: opportunities.filter((item) => item.portfolioAction === "RECHECK_THESIS" && (item.relativeVolume ?? 0) >= 2).map((item) => ({ ticker: item.ticker, level: "warning" as const, message: `RVOL ${item.relativeVolume?.toFixed(2)}x。投資仮説を再確認してください` })), economicEvents: [],
    news: newsResult.items.map((item) => ({ id: item.id, sourceType: "news" as const, sourceName: item.source, sourceUrl: item.url, publishedAt: item.publishedAt, fetchedAt: item.fetchedAt, fact: item.factSummary, metric: "economic_news", value: item.impact, freshness: item.freshness })),
    summary: marketRegime === "DATA_INCOMPLETE" ? "市場データが不十分です。GO候補への昇格は停止しています。" : `市場は${marketRegime}。必須Evidenceと80%以上のcoverageを満たす場合のみGO候補になります。` };
  await saveIntelligenceToday(result); return result;
}
