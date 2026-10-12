import type { DecisionPerformance, DecisionPerformanceSummary, DrawdownField, GainField, ReturnField } from "./types";
import { MINIMUM_LEARNING_SAMPLE } from "./types";

const round2 = (value: number) => Math.round(value * 100) / 100;

function mean(values: number[]): number | null {
  return values.length === 0 ? null : round2(values.reduce((sum, v) => sum + v, 0) / values.length);
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return round2(sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2);
}

/**
 * Summarizes Decision Performance for one return window. GO/WAIT/PASS are all eligible —
 * tracking WAIT/PASS outcomes (missed-opportunity / correctly-avoided cases) is required by
 * INVESTMENT_THINKING_MODEL.md, not just GO's winners.
 */
export function buildDecisionPerformanceSummary(
  performances: DecisionPerformance[],
  fields: { returnField: ReturnField; drawdownField: DrawdownField; gainField: GainField } = { returnField: "return20d", drawdownField: "maxDrawdown20d", gainField: "maxGain20d" },
  minimumSample = MINIMUM_LEARNING_SAMPLE
): DecisionPerformanceSummary {
  const valid = performances.filter((item) => item.dataStatus === "VALID");
  const returns = valid.map((item) => item[fields.returnField]).filter((value): value is number => value !== null);
  const drawdowns = valid.map((item) => item[fields.drawdownField]).filter((value): value is number => value !== null);
  const gains = valid.map((item) => item[fields.gainField]).filter((value): value is number => value !== null);

  if (performances.length === 0) {
    return { sampleSize: 0, winRate: null, averageReturn: null, medianReturn: null, expectedValue: null, averageMaxDrawdown: null, averageMaxGain: null, riskRewardRatio: null, status: "DATA_INCOMPLETE" };
  }

  const sampleSize = returns.length;
  const averageReturn = mean(returns);
  const averageMaxDrawdown = mean(drawdowns);
  const averageMaxGain = mean(gains);

  return {
    sampleSize,
    winRate: sampleSize === 0 ? null : round2((returns.filter((value) => value > 0).length / sampleSize) * 100),
    averageReturn,
    medianReturn: median(returns),
    // No position-size/stake model exists; EV of % return is the average % return (documented in types.ts).
    expectedValue: averageReturn,
    averageMaxDrawdown,
    averageMaxGain,
    riskRewardRatio: averageMaxDrawdown !== null && averageMaxDrawdown > 0 && averageMaxGain !== null ? round2(averageMaxGain / averageMaxDrawdown) : null,
    status: sampleSize === 0 ? "DATA_INCOMPLETE" : sampleSize < minimumSample ? "INSUFFICIENT_SAMPLE" : "VALID",
  };
}
