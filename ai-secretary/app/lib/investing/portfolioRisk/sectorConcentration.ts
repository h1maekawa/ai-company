import type { Position } from "../types";
import { buildConcentrationAssessment, sectorsForTicker } from "./shared";
import { PORTFOLIO_RISK_THRESHOLDS } from "./thresholds";
import type { PortfolioRiskAssessment } from "./types";

/** Sector mapping reuses the existing THEME_UNIVERSE -> sector table (app/lib/investing/intelligence/themes.ts). */
export function buildSectorConcentration(positions: Position[]): PortfolioRiskAssessment {
  return buildConcentrationAssessment({
    key: "sectorConcentration",
    positions,
    keysFor: (position) => sectorsForTicker(position.code),
    thresholds: PORTFOLIO_RISK_THRESHOLDS.sectorConcentration,
    reasonLabel: "最大セクター",
    emptyReason: "評価額のある保有がありません",
    noMappingReason: "既存Theme Universeからセクターを推定できる保有がありません",
  });
}
