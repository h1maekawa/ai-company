/**
 * Portfolio Intelligence (PR-D).
 *
 * This is a second, additive risk view alongside the existing `app/lib/investing/analysis.ts`
 * (`computeHealth` — single-stock concentration / asset-class diversification / breadth / cash
 * ratio). That file is kept, unchanged, for backward compatibility; it is NOT used as the
 * primary portfolio risk signal here, per the Investment Thinking Model's Portfolio Intelligence
 * department scope (docs/INVESTMENT_DEPARTMENT_STRUCTURE.md §④).
 *
 * `score`'s unit is dimension-specific (a measured percentage, a correlation coefficient, etc.),
 * not a normalized 0-100 "goodness" score like `analysis.ts`'s `HealthFactor.score` — this is
 * diagnostic exposure data, read alongside `level`, not a single health number.
 */

export type PortfolioRiskLevel = "LOW" | "MEDIUM" | "HIGH" | "DATA_INCOMPLETE";

export type PortfolioRiskKey =
  | "themeConcentration"
  | "sectorConcentration"
  | "singleStockExposure"
  | "countryExposure"
  | "currencyExposure"
  | "correlationRisk"
  | "drawdownRisk"
  | "thesisRisk";

export type PortfolioRiskAssessment = {
  key: PortfolioRiskKey;
  level: PortfolioRiskLevel;
  score: number | null;
  coverage: number;
  reason: string | null;
  evidenceRefs: string[];
  affectedTickers: string[];
};

export type PortfolioRiskReport = {
  generatedAt: string;
  assessments: PortfolioRiskAssessment[];
};
