import type { Position } from "../types";
import { buildConcentrationAssessment, themesForTicker } from "./shared";
import { PORTFOLIO_RISK_THRESHOLDS } from "./thresholds";
import type { PortfolioRiskAssessment } from "./types";

/**
 * Multiple tickers in the same theme are not "diversified" just because they are different
 * tickers. Per INVESTMENT_THINKING_MODEL.md: concentration is reported, never auto-corrected.
 */
export function buildThemeConcentration(positions: Position[]): PortfolioRiskAssessment {
  return buildConcentrationAssessment({
    key: "themeConcentration",
    positions,
    keysFor: (position) => themesForTicker(position.code),
    thresholds: PORTFOLIO_RISK_THRESHOLDS.themeConcentration,
    reasonLabel: "最大テーマ",
    emptyReason: "評価額のある保有がありません",
    noMappingReason: "既存Theme Universeに一致する保有がありません",
  });
}
