import type { Position } from "../types";
import { buildConcentrationAssessment } from "./shared";
import { PORTFOLIO_RISK_THRESHOLDS } from "./thresholds";
import type { PortfolioRiskAssessment } from "./types";

/**
 * Country is derived only from the existing `assetClass` (`us_stock` -> US, `jp_stock` ->
 * Japan). `fund`/`cash`/`other` have no listing-country metadata anywhere in the current
 * holdings model and are left UNKNOWN rather than guessed.
 */
function countryFor(position: Position): string[] {
  if (position.assetClass === "us_stock") return ["US"];
  if (position.assetClass === "jp_stock") return ["Japan"];
  return [];
}

export function buildCountryExposure(positions: Position[]): PortfolioRiskAssessment {
  return buildConcentrationAssessment({
    key: "countryExposure",
    positions,
    keysFor: countryFor,
    thresholds: PORTFOLIO_RISK_THRESHOLDS.countryExposure,
    reasonLabel: "最大国",
    emptyReason: "評価額のある保有がありません",
    noMappingReason: "国を判定できる保有がありません（fund/cash/otherはUNKNOWN）",
  });
}
