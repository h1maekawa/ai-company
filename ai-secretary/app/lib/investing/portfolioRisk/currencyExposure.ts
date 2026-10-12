import type { Position } from "../types";
import { buildConcentrationAssessment } from "./shared";
import { PORTFOLIO_RISK_THRESHOLDS } from "./thresholds";
import type { PortfolioRiskAssessment } from "./types";

/**
 * Uses the existing `Position.currency` (USD/JPY) directly — a listing-currency exposure view,
 * not an FX-hedge estimate. No hedge ratio is inferred anywhere in this department.
 */
export function buildCurrencyExposure(positions: Position[]): PortfolioRiskAssessment {
  return buildConcentrationAssessment({
    key: "currencyExposure",
    positions,
    keysFor: (position) => [position.currency],
    thresholds: PORTFOLIO_RISK_THRESHOLDS.currencyExposure,
    reasonLabel: "最大通貨",
    emptyReason: "評価額のある保有がありません",
    noMappingReason: "評価額のある保有がありません",
  });
}
