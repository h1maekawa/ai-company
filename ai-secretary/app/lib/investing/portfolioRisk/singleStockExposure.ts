import type { Position } from "../types";
import { buildConcentrationAssessment } from "./shared";
import { PORTFOLIO_RISK_THRESHOLDS } from "./thresholds";
import type { PortfolioRiskAssessment } from "./types";

export function buildSingleStockExposure(positions: Position[]): PortfolioRiskAssessment {
  return buildConcentrationAssessment({
    key: "singleStockExposure",
    positions,
    keysFor: (position) => [position.code],
    thresholds: PORTFOLIO_RISK_THRESHOLDS.singleStockExposure,
    reasonLabel: "最大銘柄",
    emptyReason: "評価額のある保有がありません",
    noMappingReason: "評価額のある保有がありません",
  });
}
