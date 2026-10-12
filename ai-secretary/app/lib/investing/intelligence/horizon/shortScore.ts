import { adtv20, marketEnv, type DailyBar } from "../../../fund/marketData/calc";
import { momentumPct } from "../../../fund/analyst";
import { INVESTMENT_INTELLIGENCE_CONFIG } from "../config";
import type { InvestmentOpportunity } from "../types";
import { buildAssessment, buildFactor, clamp, relativeStrength20d, rescaleExistingFactor } from "./shared";
import type { HorizonAssessment } from "./types";

/**
 * SHORT (1 trading day - 4 weeks) per INVESTMENT_THINKING_MODEL.md §Short Score.
 * Reuses existing raw market data (rvol20/momentumPct/adtv20/marketEnv from
 * app/lib/fund/marketData/calc.ts and app/lib/fund/analyst.ts) and the existing Catalyst/Sector
 * Strength/Macro Fit factors already computed on InvestmentOpportunity.breakdown. No new
 * provider or raw-data source is introduced.
 */
export function buildShortTermAssessment(opportunity: InvestmentOpportunity, bars: DailyBar[] | null, spyBars: DailyBar[] | null, now = new Date()): HorizonAssessment {
  const relativeVolume = opportunity.relativeVolume;
  const momentum5d = bars ? momentumPct(bars, 5) : null;
  const relativeStrength = relativeStrength20d(bars, spyBars);
  const technicalPosition = bars ? marketEnv(bars) : "UNKNOWN";
  const liquidity = bars ? adtv20(bars) : null;
  const freshNews = opportunity.evidence.filter((item) => item.sourceType === "news" && !["stale", "unknown"].includes(item.freshness));

  const factors = [
    buildFactor("relativeVolume", "Relative Volume", 20, relativeVolume === null ? null : { score: relativeVolume >= 2 ? 100 : relativeVolume * 50, reason: `RVOL20 ${relativeVolume.toFixed(2)}x`, evidenceRefs: opportunity.evidence.filter((item) => item.metric === "ohlcv").map((item) => item.id) }),
    buildFactor("priceMomentum", "Price Momentum", 15, momentum5d === null ? null : { score: clamp(0, 100, 50 + momentum5d * 5), reason: `5営業日モメンタム ${momentum5d.toFixed(1)}%` }),
    buildFactor("catalyst", "Catalyst", 15, rescaleExistingFactor(opportunity.breakdown, "catalyst")),
    buildFactor("sectorStrength", "Sector Strength", 10, rescaleExistingFactor(opportunity.breakdown, "sectorStrength")),
    buildFactor("relativeStrength", "Relative Strength", 10, relativeStrength === null ? null : { score: clamp(0, 100, 50 + relativeStrength * 2), reason: `20日モメンタムがSPYと比べ${relativeStrength >= 0 ? "+" : ""}${relativeStrength.toFixed(1)}pt` }),
    buildFactor("marketRegime", "Market Regime", 10, rescaleExistingFactor(opportunity.breakdown, "macroFit")),
    buildFactor("technicalPosition", "Technical Position", 10, technicalPosition === "UNKNOWN" ? null : { score: technicalPosition === "RISK_ON" ? 100 : technicalPosition === "NEUTRAL" ? 50 : 0, reason: `ticker自身の200/50日線トレンドは${technicalPosition}` }),
    buildFactor("newsMomentum", "News Momentum", 5, { score: Math.min(100, freshNews.length * 30), reason: `直近${freshNews.length}件のfresh news evidence`, evidenceRefs: freshNews.map((item) => item.id) }),
    buildFactor("liquidity", "Liquidity", 5, liquidity === null ? null : { score: liquidity >= INVESTMENT_INTELLIGENCE_CONFIG.minimumAdtvUsd * 5 ? 100 : liquidity >= INVESTMENT_INTELLIGENCE_CONFIG.minimumAdtvUsd ? 60 : 20, reason: `ADTV20 $${liquidity.toLocaleString()}` }),
  ];

  return buildAssessment("SHORT", factors, opportunity, now);
}
