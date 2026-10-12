import type { DailyBar } from "../../../fund/marketData/calc";

const round2 = (value: number) => Math.round(value * 100) / 100;

/** First bar on or after the decision date. null when the decision pre-dates the fetched series. */
export function findDecisionBarIndex(bars: DailyBar[], decisionAtIso: string): number | null {
  const decisionDate = decisionAtIso.slice(0, 10);
  const index = bars.findIndex((bar) => bar.date >= decisionDate);
  return index === -1 ? null : index;
}

/**
 * Return (%) at `offsetDays` trading bars after the decision bar. null when that many bars
 * have not elapsed yet — this is "the future hasn't happened," never filled with 0 or a guess.
 */
export function computeReturnAt(bars: DailyBar[], decisionIndex: number, decisionPrice: number, offsetDays: number): number | null {
  const targetIndex = decisionIndex + offsetDays;
  if (targetIndex >= bars.length || decisionPrice <= 0) return null;
  return round2(((bars[targetIndex].close - decisionPrice) / decisionPrice) * 100);
}

/**
 * Max drawdown/gain (%, both as positive magnitudes) within [decisionIndex, decisionIndex +
 * windowDays], matching the existing drawdown convention in
 * app/lib/investing/portfolioRisk/drawdownRisk.ts. null when the window hasn't fully elapsed.
 */
export function computeMaxDrawdownGain(bars: DailyBar[], decisionIndex: number, decisionPrice: number, windowDays: number): { maxDrawdownPct: number | null; maxGainPct: number | null } {
  const endIndex = decisionIndex + windowDays;
  if (endIndex >= bars.length || decisionPrice <= 0) return { maxDrawdownPct: null, maxGainPct: null };
  let minClose = Infinity;
  let maxClose = -Infinity;
  for (let i = decisionIndex; i <= endIndex; i++) {
    minClose = Math.min(minClose, bars[i].close);
    maxClose = Math.max(maxClose, bars[i].close);
  }
  return {
    maxDrawdownPct: round2(Math.max(0, ((decisionPrice - minClose) / decisionPrice) * 100)),
    maxGainPct: round2(Math.max(0, ((maxClose - decisionPrice) / decisionPrice) * 100)),
  };
}
