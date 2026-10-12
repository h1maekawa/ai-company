import type { DailyBar } from "../../fund/marketData/calc";
import type { InvestmentOpportunity } from "../intelligence/types";
import type { InvestmentResearchBundle } from "../intelligence/research/types";
import type { Portfolio, ValuePoint } from "../types";
import { buildCorrelationRisk } from "./correlationRisk";
import { buildCountryExposure } from "./countryExposure";
import { buildCurrencyExposure } from "./currencyExposure";
import { buildDrawdownRisk } from "./drawdownRisk";
import { buildSectorConcentration } from "./sectorConcentration";
import { buildSingleStockExposure } from "./singleStockExposure";
import { buildThemeConcentration } from "./themeConcentration";
import { buildThesisRisk } from "./thesisRisk";
import type { PortfolioRiskReport } from "./types";

/**
 * Composes the 8 Portfolio Intelligence risk dimensions. Pure function over already-loaded
 * inputs — no network I/O, no persistence, no portfolio mutation. Reuses the existing
 * Investment Research (PR-B) and Horizon/Triple Gate (PR-C) artifacts for Thesis Risk; does not
 * recompute or duplicate opportunity scoring.
 */
export function buildPortfolioRiskReport(input: {
  portfolio: Portfolio;
  opportunities: InvestmentOpportunity[];
  research: InvestmentResearchBundle | undefined;
  history: ValuePoint[];
  correlationBars: Map<string, DailyBar[]>;
  now?: Date;
}): PortfolioRiskReport {
  const now = input.now ?? new Date();
  return {
    generatedAt: now.toISOString(),
    assessments: [
      buildThemeConcentration(input.portfolio.positions),
      buildSectorConcentration(input.portfolio.positions),
      buildSingleStockExposure(input.portfolio.positions),
      buildCountryExposure(input.portfolio.positions),
      buildCurrencyExposure(input.portfolio.positions),
      buildCorrelationRisk(input.portfolio.positions, input.correlationBars),
      buildDrawdownRisk(input.history, now),
      buildThesisRisk(input.portfolio.positions, input.opportunities, input.research),
    ],
  };
}
