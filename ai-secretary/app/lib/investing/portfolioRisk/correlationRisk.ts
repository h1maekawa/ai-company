import type { DailyBar } from "../../fund/marketData/calc";
import type { Position } from "../types";
import { round2, valuedPositions } from "./shared";
import { PORTFOLIO_RISK_THRESHOLDS } from "./thresholds";
import type { PortfolioRiskAssessment } from "./types";

const MAX_CANDIDATES = 5;
const MIN_BARS = 30;

function dailyReturns(bars: DailyBar[]): number[] {
  const returns: number[] = [];
  for (let i = 1; i < bars.length; i++) {
    const prev = bars[i - 1].close;
    if (prev > 0) returns.push((bars[i].close - prev) / prev);
  }
  return returns;
}

function pearson(a: number[], b: number[]): number | null {
  const length = Math.min(a.length, b.length);
  if (length < 10) return null;
  const x = a.slice(-length);
  const y = b.slice(-length);
  const meanX = x.reduce((sum, v) => sum + v, 0) / length;
  const meanY = y.reduce((sum, v) => sum + v, 0) / length;
  let cov = 0; let varX = 0; let varY = 0;
  for (let i = 0; i < length; i++) {
    const dx = x[i] - meanX; const dy = y[i] - meanY;
    cov += dx * dy; varX += dx * dx; varY += dy * dy;
  }
  if (varX === 0 || varY === 0) return null;
  return cov / Math.sqrt(varX * varY);
}

function levelFor(correlation: number): "LOW" | "MEDIUM" | "HIGH" {
  const cfg = PORTFOLIO_RISK_THRESHOLDS.correlationRisk;
  if (correlation > cfg.highCorrelation) return "HIGH";
  if (correlation > cfg.mediumCorrelation) return "MEDIUM";
  return "LOW";
}

/**
 * Average pairwise Pearson correlation of daily returns across the top (by value) holdings with
 * available bars. Bars must be pre-fetched by the caller via the existing
 * app/lib/fund/marketData provider (see loader.ts) — this function stays pure over its inputs,
 * consistent with app/lib/investing/intelligence/research/* and horizon/*.
 */
export function buildCorrelationRisk(positions: Position[], barsByTicker: Map<string, DailyBar[]>): PortfolioRiskAssessment {
  const valued = valuedPositions(positions).sort((a, b) => (b.marketValueJpy ?? 0) - (a.marketValueJpy ?? 0));
  const candidates = valued.filter((position) => (barsByTicker.get(position.code)?.length ?? 0) >= MIN_BARS).slice(0, MAX_CANDIDATES);

  if (candidates.length < 2) {
    return { key: "correlationRisk", level: "DATA_INCOMPLETE", score: null, coverage: 0, reason: "相関を計算できる十分な価格データのある保有が2件未満です", evidenceRefs: [], affectedTickers: candidates.map((position) => position.code) };
  }

  const returnsByTicker = new Map(candidates.map((position) => [position.code, dailyReturns(barsByTicker.get(position.code)!)]));
  const pairs: number[] = [];
  for (let i = 0; i < candidates.length; i++) {
    for (let j = i + 1; j < candidates.length; j++) {
      const correlation = pearson(returnsByTicker.get(candidates[i].code)!, returnsByTicker.get(candidates[j].code)!);
      if (correlation !== null) pairs.push(correlation);
    }
  }

  if (pairs.length === 0) {
    return { key: "correlationRisk", level: "DATA_INCOMPLETE", score: null, coverage: 0, reason: "価格データはありますが共通の取引日数が不足しています", evidenceRefs: [], affectedTickers: candidates.map((position) => position.code) };
  }

  const average = round2(pairs.reduce((sum, value) => sum + value, 0) / pairs.length);
  const totalValued = valuedPositions(positions).length;
  return {
    key: "correlationRisk",
    level: levelFor(average),
    score: average,
    coverage: round2(candidates.length / totalValued),
    reason: `上位${candidates.length}銘柄の日次リターン平均相関 ${average}`,
    evidenceRefs: [],
    affectedTickers: candidates.map((position) => position.code),
  };
}
