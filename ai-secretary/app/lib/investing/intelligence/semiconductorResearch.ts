import { THEME_UNIVERSE } from "./themes";
import type { InvestmentEvidence, InvestmentOpportunity, IntelligenceFreshness, IntelligenceToday } from "./types";
import type { Position } from "../types";
import { classifyMarketTimestamp } from "../../fund/marketData/trust";

const SEMICONDUCTOR_TICKERS = new Set(
  THEME_UNIVERSE.filter((theme) => theme.sectors.includes("Semiconductors")).flatMap((theme) => theme.tickers.map((ticker) => ticker.toUpperCase())),
);

export type SemiconductorHoldingResearch = {
  ticker: string;
  company: string;
  price: { value: number; currency: "USD" | "JPY" | "UNKNOWN"; asOf: string | null; fetchedAt: string; freshness: InvestmentEvidence["freshness"] } | null;
  causes: { market: InvestmentEvidence[]; industry: InvestmentEvidence[]; company: InvestmentEvidence[] };
  financialEvidence: InvestmentEvidence[];
  scenarios: InvestmentOpportunity["scenarios"];
  risks: string[];
  missing: string[];
};

export type SemiconductorPortfolioResearch = {
  generatedAt: string | null;
  classification: "THEME_UNIVERSE_ONLY";
  semiconductors: SemiconductorHoldingResearch[];
  semiconductorIndex: IntelligenceToday["sectors"][number] | null;
  review: string[];
};

/** Projects private portfolio membership onto existing Research without returning position sizes. */
export function buildSemiconductorPortfolioResearch(
  positions: Position[],
  today: IntelligenceToday | null,
): SemiconductorPortfolioResearch {
  const held = new Map<string, Position>();
  for (const position of positions) {
    const ticker = position.code.trim().toUpperCase();
    if (position.assetClass === "us_stock" && SEMICONDUCTOR_TICKERS.has(ticker)) held.set(ticker, position);
  }

  const semiconductors = [...held.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([ticker, position]) => {
    const opportunity = today?.opportunities.find((item) => item.ticker.toUpperCase() === ticker);
    const evidence = opportunity?.evidence ?? [];
    const marketQuote = evidence
      .filter((item) => item.sourceType === "market" && item.metric === "ohlcv" && typeof item.value === "number" && Number.isFinite(item.value))
      .sort((a, b) => (b.publishedAt ?? "").localeCompare(a.publishedAt ?? ""))[0];
    const causes = {
      market: [...(today?.marketEvidence ?? []), ...evidence].filter((item) => item.scope === "MARKET" || (item.scope === undefined && item.sourceType === "market")),
      industry: evidence.filter((item) => item.scope === "INDUSTRY"),
      company: evidence.filter((item) => item.scope === "COMPANY" || (item.scope === undefined && item.sourceType === "research")),
    };
    const financialEvidence = causes.company.filter((item) => item.metric === "fundamentals");
    const missing = [...(opportunity?.missingEvidence ?? []), ...(opportunity?.missingData ?? [])];
    if (!marketQuote) missing.push("株価Evidence");
    else if (!marketQuote.currency || marketQuote.currency === "UNKNOWN") missing.push("株価通貨");
    const quoteFreshness = marketQuote ? classifyMarketTimestamp(marketQuote.publishedAt) : "UNKNOWN";
    const quoteFreshnessLabel: IntelligenceFreshness = quoteFreshness === "FRESH" ? "daily" : quoteFreshness === "STALE" ? "stale" : "unknown";
    if (marketQuote && quoteFreshness !== "FRESH") missing.push(quoteFreshness === "STALE" ? "最新株価（鮮度超過）" : "株価観測日時");
    if (financialEvidence.length === 0) missing.push("決算・業績Evidence");
    if (!today) missing.push("Investment Intelligence snapshot");
    if (!causes.industry.length && !today?.sectors.some((sector) => sector.name === "Semiconductors" && sector.score !== null)) missing.push("半導体業界Evidence");
    const price = marketQuote ? {
      value: marketQuote.value as number,
      currency: marketQuote.currency ?? "UNKNOWN" as const,
      asOf: marketQuote.publishedAt,
      fetchedAt: marketQuote.fetchedAt,
      freshness: quoteFreshnessLabel,
    } : null;
    return {
      ticker,
      company: position.name || ticker,
      price,
      causes,
      financialEvidence,
      scenarios: opportunity?.scenarios ?? [],
      risks: opportunity?.riskFlags.map((risk) => risk.detail) ?? [],
      missing: [...new Set(missing)],
    };
  });

  return {
    generatedAt: today?.asOf ?? null,
    classification: "THEME_UNIVERSE_ONLY",
    semiconductors,
    semiconductorIndex: today?.sectors.find((sector) => sector.name === "Semiconductors") ?? null,
    review: [
      "保有銘柄は既存Theme Universeで半導体セクターに明示された米国株に限定して照合しています。",
      "追加購入は買いシグナルではありません。最新価格・業績・評価・業界要因を確認し、価格下落だけで判断しないでください。",
      "株数、取得単価、評価額はResearch出力に含めていません。",
    ],
  };
}
