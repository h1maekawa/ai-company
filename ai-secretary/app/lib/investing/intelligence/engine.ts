import type { DailyBar } from "../../fund/marketData/calc";
import { adtv20, changePct, marketEnv, rvol20 } from "../../fund/marketData/calc";
import { tokyoDateKey } from "../../note/tokyoDate";
import { INVESTMENT_INTELLIGENCE_CONFIG } from "./config";
import type { FundamentalSnapshot, InvestmentEvidence, InvestmentOpportunity, MacroSnapshot, MarketRegime, MarketRegimeArtifact, ScoreFactor, SectorSnapshot } from "./types";

const WEIGHTS: Array<[ScoreFactor["key"], string, number]> = [
  ["futureDemand", "Future Demand", 20], ["volume", "Volume / Money Flow", 15],
  ["earningsGrowth", "Earnings Growth", 15], ["quality", "FCF / ROIC", 10],
  ["sectorStrength", "Sector Strength", 10], ["catalyst", "Catalyst", 10],
  ["valuation", "Valuation", 10], ["macroFit", "Macro Fit", 5],
  ["portfolioFit", "Portfolio Fit", 5],
];

const MARKET_INPUTS = ["S&P500", "NASDAQ", "SOX", "VIX", "US10Y", "USDJPY"] as const;
export function deriveMarketRegime(input: { spy: DailyBar[] | null; nasdaq: DailyBar[] | null; sox: DailyBar[] | null; vix: DailyBar[] | null; macro: MacroSnapshot; now?: Date }): MarketRegimeArtifact {
  const now = input.now ?? new Date();
  const indexes = [["S&P500", input.spy], ["NASDAQ", input.nasdaq], ["SOX", input.sox]] as const;
  const indexRegimes = indexes.map(([name, bars]) => ({ name, regime: bars && freshnessOfBars(bars, now) !== "stale" ? marketEnv(bars) : "UNKNOWN", date: bars?.at(-1)?.date }));
  const vixDate = input.vix?.at(-1)?.date; const vixChange = input.vix && freshnessOfBars(input.vix, now) !== "stale" ? changePct(input.vix) : null;
  const us10y = input.macro.metrics.find((metric) => metric.id === "DGS10" && metric.value !== null && !["stale", "unknown"].includes(metric.freshness));
  const usdJpy = input.macro.metrics.find((metric) => metric.id === "USDJPY" && metric.value !== null && !["stale", "unknown"].includes(metric.freshness));
  const availableInputs = [...indexRegimes.filter((item) => item.regime !== "UNKNOWN").map((item) => item.name), ...(vixChange === null ? [] : ["VIX"]), ...(us10y ? ["US10Y"] : []), ...(usdJpy ? ["USDJPY"] : [])];
  const evidenceRefs = [...indexRegimes.filter((item) => item.regime !== "UNKNOWN").map((item) => `market:${item.name}:${item.date}`), ...(vixChange === null ? [] : [`market:VIX:${vixDate}`]), ...(us10y ? [`macro:DGS10:${us10y.observedAt}`] : []), ...(usdJpy ? [`macro:USDJPY:${usdJpy.observedAt}`] : [])];
  const coverage = availableInputs.length / MARKET_INPUTS.length;
  if (coverage < 1) return { regime: "DATA_INCOMPLETE", requiredInputs: [...MARKET_INPUTS], availableInputs, coverage, evidenceRefs };
  const riskOn = indexRegimes.filter((item) => item.regime === "RISK_ON").length; const riskOff = indexRegimes.filter((item) => item.regime === "RISK_OFF").length;
  const regime = riskOn >= 2 && (vixChange ?? 0) <= 0 ? "RISK_ON" : riskOff >= 2 && (vixChange ?? 0) >= 0 ? "RISK_OFF" : "NEUTRAL";
  return { regime, requiredInputs: [...MARKET_INPUTS], availableInputs, coverage, evidenceRefs };
}

export function buildOpportunity(input: {
  ticker: string; name: string; theme: string; bars: DailyBar[] | null;
  marketRegime: MarketRegime; held: boolean; evidence: InvestmentEvidence[]; fundamental?: FundamentalSnapshot; sector?: SectorSnapshot; now?: Date;
}): InvestmentOpportunity {
  const now = input.now ?? new Date();
  const relativeVolume = input.bars ? rvol20(input.bars) : null;
  const priceChangePct = input.bars ? changePct(input.bars) : null;
  const freshEvidence = input.evidence.filter((item) => !["stale", "unknown"].includes(item.freshness));
  const volumeScore = relativeVolume === null ? null : Math.min(15, Math.max(0, relativeVolume >= 2 ? 15 : relativeVolume * 7.5));
  const macroScore = input.marketRegime === "DATA_INCOMPLETE" ? null : input.marketRegime === "RISK_ON" ? 5 : input.marketRegime === "NEUTRAL" ? 3 : 1;
  const usableFundamental = input.fundamental?.sourceUrl && !["stale", "unknown"].includes(input.fundamental.freshness) ? input.fundamental : undefined;
  const revenueGrowth = usableFundamental?.revenueGrowth ?? null;
  const epsGrowth = usableFundamental?.epsGrowth ?? null;
  const growth = revenueGrowth ?? epsGrowth;
  const earningsScore = growth === null ? null : Math.max(0, Math.min(15, 7.5 + growth / 4));
  const qualityScore = usableFundamental?.fcf === null || usableFundamental?.fcf === undefined ? null : usableFundamental.fcf > 0 ? 10 : 2;
  const sectorScore = !input.sector || ["stale", "unknown"].includes(input.sector.freshness) || input.sector.score === null ? null : input.sector.score / 10;
  const newsEvidence = freshEvidence.filter((item) => item.sourceType === "news" && item.sourceUrl && item.value !== "unknown");
  const demandEvidence = newsEvidence.filter((item) => item.metric === "news:future_demand");
  const catalystEvidence = newsEvidence.filter((item) => item.metric === "news:catalyst");
  const demandScore = demandEvidence.length === 0 ? null : Math.min(20, 10 + demandEvidence.length * 2);
  const catalystScore = catalystEvidence.length === 0 ? null : Math.min(10, 5 + catalystEvidence.length);
  const known: Partial<Record<ScoreFactor["key"], { score: number; reason: string }>> = {
    volume: volumeScore === null ? undefined : { score: volumeScore, reason: `RVOL20 ${relativeVolume?.toFixed(2)}x` },
    macroFit: macroScore === null ? undefined : { score: macroScore, reason: `Market Regime ${input.marketRegime}` },
    earningsGrowth: earningsScore === null ? undefined : { score: earningsScore, reason: `Revenue/EPS growth ${growth?.toFixed(1)}%` },
    quality: qualityScore === null ? undefined : { score: qualityScore, reason: `FCF ${usableFundamental?.fcf?.toLocaleString()}` },
    sectorStrength: sectorScore === null ? undefined : { score: sectorScore, reason: `${input.sector?.name} score ${input.sector?.score}` },
    futureDemand: demandScore === null ? undefined : { score: demandScore, reason: `${demandEvidence.length}件の需要Evidenceを確認` },
    catalyst: catalystScore === null ? undefined : { score: catalystScore, reason: `${catalystEvidence.length}件のCatalyst Evidenceを確認` },
  };
  const breakdown = WEIGHTS.map(([key, label, weight]): ScoreFactor => ({
    key, label, weight, score: known[key]?.score ?? null,
    reason: known[key]?.reason ?? "Evidence未取得のため採点しません",
  }));
  const scoredWeight = breakdown.filter((factor) => factor.score !== null).reduce((sum, factor) => sum + factor.weight, 0);
  const score = breakdown.some((factor) => factor.score !== null)
    ? Math.round(breakdown.reduce((sum, factor) => sum + (factor.score ?? 0), 0)) : null;
  const missingData = breakdown.filter((factor) => factor.score === null).map((factor) => factor.label);
  if (relativeVolume === null) missingData.push("Relative Volume");
  if (freshEvidence.length === 0) missingData.push("Fresh Evidence");
  const coverage = scoredWeight / 100;
  const fundamentalEvidence = Boolean(input.fundamental?.sourceUrl && !["stale", "unknown"].includes(input.fundamental.freshness) && [input.fundamental.revenue, input.fundamental.eps, input.fundamental.fcf].some((value) => value !== null));
  const mandatoryEvidence = ["fresh_market", "relative_volume", "market_regime", "fundamental", "source_evidence"];
  const missingEvidence = [!input.bars || freshnessOfBars(input.bars, now) === "stale" ? "fresh_market" : null, relativeVolume === null ? "relative_volume" : null, input.marketRegime === "DATA_INCOMPLETE" ? "market_regime" : null, !fundamentalEvidence ? "fundamental" : null, freshEvidence.length < 2 ? "source_evidence" : null].filter((value): value is string => Boolean(value));
  const liquidity = input.bars ? adtv20(input.bars) : null;
  const distinctNewsSources = new Set(newsEvidence.map((item) => item.sourceName)).size;
  const riskFlags = [
    liquidity !== null && liquidity < INVESTMENT_INTELLIGENCE_CONFIG.minimumAdtvUsd ? { code: "LOW_LIQUIDITY" as const, severity: "critical" as const, detail: `ADTV20 $${liquidity.toLocaleString()} は最低基準未満です` } : null,
    input.fundamental && ["stale", "unknown"].includes(input.fundamental.freshness) ? { code: "FUNDAMENTAL_STALE" as const, severity: "critical" as const, detail: "Fundamental Evidenceがstale/unknownです" } : null,
    newsEvidence.length > 0 && distinctNewsSources < 2 ? { code: "SINGLE_SOURCE" as const, severity: "warning" as const, detail: "News Evidenceが単一ソースです" } : null,
    input.marketRegime === "RISK_OFF" ? { code: "MACRO_CONFLICT" as const, severity: "warning" as const, detail: "Market RegimeがRISK_OFFです" } : null,
  ].filter((flag): flag is NonNullable<typeof flag> => flag !== null);
  const complete = coverage >= INVESTMENT_INTELLIGENCE_CONFIG.minimumOpportunityCoverage && missingEvidence.length === 0 && score !== null;
  const hasCriticalRisk = riskFlags.some((flag) => flag.severity === "critical");
  const gate = !complete ? "DATA_INCOMPLETE" : score >= 75 && !hasCriticalRisk ? "GO_CANDIDATE" : score >= 55 ? "WAIT" : "PASS";
  const marketEvidenceIds = freshEvidence.filter((item) => item.sourceType === "market").map((item) => item.id);
  const fundamentalEvidenceIds = freshEvidence.filter((item) => item.sourceType === "research" && item.sourceUrl).map((item) => item.id);
  const newsEvidenceIds = newsEvidence.map((item) => item.id);
  const scenarios = [
    newsEvidenceIds.length && marketEvidenceIds.length && fundamentalEvidenceIds.length ? { kind: "BULL" as const, trigger: "需要・出来高・業績Evidenceが同時に改善", evidenceIds: [...newsEvidenceIds, ...marketEvidenceIds, ...fundamentalEvidenceIds], whatToWatch: "RVOLと決算", invalidation: "需要Evidenceの反転", portfolioImpact: "上昇余地を再評価" } : null,
    marketEvidenceIds.length && fundamentalEvidenceIds.length ? { kind: "BASE" as const, trigger: "現在の市場環境と業績Evidenceが継続", evidenceIds: [...marketEvidenceIds, ...fundamentalEvidenceIds], whatToWatch: "次回決算と市場Regime", invalidation: "Market Regime悪化", portfolioImpact: "監視を継続" } : null,
    marketEvidenceIds.length ? { kind: "BEAR" as const, trigger: "価格下落と出来高増加", evidenceIds: marketEvidenceIds, whatToWatch: "20日安値と売り出来高", invalidation: "需要回復と高値更新", portfolioImpact: "リスク縮小を検討" } : null,
  ].filter((scenario): scenario is NonNullable<typeof scenario> => scenario !== null && scenario.evidenceIds.length > 0);
  return {
    id: `opp_${input.ticker.toLowerCase()}_${tokyoDateKey(now).replaceAll("-", "")}`,
    ticker: input.ticker, name: input.name, theme: input.theme, gate, score,
    scoreCoverage: scoredWeight, coverage, mandatoryEvidence, missingEvidence, riskFlags, breakdown, relativeVolume, priceChangePct, catalyst: null,
    whyNow: relativeVolume === null ? "出来高データが揃うまで判断を保留します" : `出来高は20日平均の${relativeVolume.toFixed(2)}倍です`,
    portfolioImpact: input.held ? "保有中のため、投資仮説とリスクを再確認します" : "未保有候補。既存ポートフォリオとの重複を確認します",
    portfolioAction: input.held ? "RECHECK_THESIS" : "WATCH",
    scenarios,
    evidence: input.evidence, missingData: [...new Set(missingData)], generatedAt: now.toISOString(),
  };
}

function freshnessOfBars(bars: DailyBar[], now: Date): "daily" | "stale" {
  const date = bars.at(-1)?.date;
  if (!date) return "stale";
  return now.getTime() - new Date(`${date}T23:59:59Z`).getTime() <= 4 * 86_400_000 ? "daily" : "stale";
}
