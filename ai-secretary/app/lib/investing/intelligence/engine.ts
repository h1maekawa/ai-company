import type { DailyBar } from "../../fund/marketData/calc";
import { changePct, marketEnv, rvol20 } from "../../fund/marketData/calc";
import type { FundamentalSnapshot, InvestmentEvidence, InvestmentOpportunity, MarketRegime, ScoreFactor, SectorSnapshot } from "./types";

const WEIGHTS: Array<[ScoreFactor["key"], string, number]> = [
  ["futureDemand", "Future Demand", 20], ["volume", "Volume / Money Flow", 15],
  ["earningsGrowth", "Earnings Growth", 15], ["quality", "FCF / ROIC", 10],
  ["sectorStrength", "Sector Strength", 10], ["catalyst", "Catalyst", 10],
  ["valuation", "Valuation", 10], ["macroFit", "Macro Fit", 5],
  ["portfolioFit", "Portfolio Fit", 5],
];

export function deriveMarketRegime(bars: DailyBar[] | null): MarketRegime {
  if (!bars) return "DATA_INCOMPLETE";
  const regime = marketEnv(bars);
  return regime === "UNKNOWN" ? "DATA_INCOMPLETE" : regime;
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
  const portfolioScore = input.held ? 5 : 3;
  const revenueGrowth = input.fundamental?.revenueGrowth ?? null;
  const epsGrowth = input.fundamental?.epsGrowth ?? null;
  const growth = revenueGrowth ?? epsGrowth;
  const earningsScore = growth === null ? null : Math.max(0, Math.min(15, 7.5 + growth / 4));
  const qualityScore = input.fundamental?.fcf === null || input.fundamental?.fcf === undefined ? null : input.fundamental.fcf > 0 ? 10 : 2;
  const sectorScore = input.sector?.score === null || input.sector?.score === undefined ? null : input.sector.score / 10;
  const newsEvidence = freshEvidence.filter((item) => item.sourceType === "news" && item.sourceUrl);
  const demandScore = newsEvidence.length === 0 ? null : Math.min(20, 10 + newsEvidence.length * 2);
  const catalystScore = newsEvidence.length === 0 ? null : Math.min(10, 5 + newsEvidence.length);
  const known: Partial<Record<ScoreFactor["key"], { score: number; reason: string }>> = {
    volume: volumeScore === null ? undefined : { score: volumeScore, reason: `RVOL20 ${relativeVolume?.toFixed(2)}x` },
    macroFit: macroScore === null ? undefined : { score: macroScore, reason: `Market Regime ${input.marketRegime}` },
    portfolioFit: { score: portfolioScore, reason: input.held ? "保有株への直接影響" : "新規候補（重複確認が必要）" },
    earningsGrowth: earningsScore === null ? undefined : { score: earningsScore, reason: `Revenue/EPS growth ${growth?.toFixed(1)}%` },
    quality: qualityScore === null ? undefined : { score: qualityScore, reason: `FCF ${input.fundamental?.fcf?.toLocaleString()}` },
    sectorStrength: sectorScore === null ? undefined : { score: sectorScore, reason: `${input.sector?.name} score ${input.sector?.score}` },
    futureDemand: demandScore === null ? undefined : { score: demandScore, reason: `${newsEvidence.length}件のfresh sourceで需要テーマを確認` },
    catalyst: catalystScore === null ? undefined : { score: catalystScore, reason: `${newsEvidence.length}件のfresh source。解釈は本人確認が必要` },
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
  const fundamentalEvidence = input.fundamental && [input.fundamental.revenue, input.fundamental.eps, input.fundamental.fcf].some((value) => value !== null);
  const mandatoryEvidence = ["fresh_market", "relative_volume", "market_regime", "fundamental", "source_evidence"];
  const missingEvidence = [!input.bars || freshnessOfBars(input.bars, now) === "stale" ? "fresh_market" : null, relativeVolume === null ? "relative_volume" : null, input.marketRegime === "DATA_INCOMPLETE" ? "market_regime" : null, !fundamentalEvidence ? "fundamental" : null, freshEvidence.length < 2 ? "source_evidence" : null].filter((value): value is string => Boolean(value));
  const complete = coverage >= 0.8 && missingEvidence.length === 0 && score !== null;
  const gate = !complete ? "DATA_INCOMPLETE" : score >= 75 ? "GO_CANDIDATE" : score >= 55 ? "WAIT" : "PASS";
  const evidenceIds = freshEvidence.map((item) => item.id);
  return {
    id: `opp_${input.ticker.toLowerCase()}_${now.toISOString().slice(0, 10).replaceAll("-", "")}`,
    ticker: input.ticker, name: input.name, theme: input.theme, gate, score,
    scoreCoverage: scoredWeight, coverage, mandatoryEvidence, missingEvidence, breakdown, relativeVolume, priceChangePct, catalyst: null,
    whyNow: relativeVolume === null ? "出来高データが揃うまで判断を保留します" : `出来高は20日平均の${relativeVolume.toFixed(2)}倍です`,
    portfolioImpact: input.held ? "保有中のため、投資仮説とリスクを再確認します" : "未保有候補。既存ポートフォリオとの重複を確認します",
    portfolioAction: input.held ? "RECHECK_THESIS" : "WATCH",
    scenarios: [
      { kind: "BULL", trigger: "需要・出来高・業績Evidenceが同時に改善", evidenceIds, whatToWatch: "RVOLと決算", invalidation: "需要Evidenceの反転", portfolioImpact: "上昇余地を再評価" },
      { kind: "BASE", trigger: "現在の市場環境が継続", evidenceIds, whatToWatch: "次回決算と市場Regime", invalidation: "Market Regime悪化", portfolioImpact: "監視を継続" },
      { kind: "BEAR", trigger: "価格下落と出来高増加", evidenceIds, whatToWatch: "20日安値と売り出来高", invalidation: "需要回復と高値更新", portfolioImpact: "リスク縮小を検討" },
    ],
    evidence: input.evidence, missingData: [...new Set(missingData)], generatedAt: now.toISOString(),
  };
}

function freshnessOfBars(bars: DailyBar[], now: Date): "daily" | "stale" {
  const date = bars.at(-1)?.date;
  if (!date) return "stale";
  return now.getTime() - new Date(`${date}T23:59:59Z`).getTime() <= 4 * 86_400_000 ? "daily" : "stale";
}
