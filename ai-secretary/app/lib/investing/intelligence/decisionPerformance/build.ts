import type { DailyBar } from "../../../fund/marketData/calc";
import type { InvestmentDecisionRecord } from "../types";
import { computeMaxDrawdownGain, computeReturnAt, findDecisionBarIndex } from "./returns";
import type { DecisionPerformance } from "./types";

function incomplete(record: InvestmentDecisionRecord, now: Date): DecisionPerformance {
  return {
    decisionId: record.id,
    ticker: record.ticker ?? "UNKNOWN",
    decision: record.decision,
    decisionPrice: record.priceAtDecision ?? null,
    decisionAt: record.timestamp,
    shortGate: record.shortTermSnapshot?.gate ?? null,
    midGate: record.midTermSnapshot?.gate ?? null,
    longGate: record.longTermSnapshot?.gate ?? null,
    tripleGate: record.tripleGateSnapshot ?? null,
    return1d: null, return5d: null, return20d: null, return60d: null, return120d: null, return250d: null,
    maxDrawdown20d: null, maxDrawdown60d: null, maxGain20d: null, maxGain60d: null,
    evaluatedThrough: null,
    dataStatus: "DATA_INCOMPLETE",
    updatedAt: now.toISOString(),
  };
}

/**
 * Builds Decision Performance for one existing InvestmentDecisionRecord. `bars` must be
 * pre-fetched by the caller (loader.ts) via the existing market-data provider — this stays a
 * pure function over its inputs, consistent with research/* and horizon/*.
 *
 * Look-ahead-bias note: this function only ever reads price bars dated at-or-after the
 * decision, and only to measure what happened *after* the decision was made. It never feeds
 * these prices back into shortTermSnapshot/midTermSnapshot/longTermSnapshot — those are already
 * frozen on the record at decision time (see the Decision Snapshot comment on
 * InvestmentDecisionRecord in app/lib/investing/intelligence/types.ts).
 */
export function buildDecisionPerformance(record: InvestmentDecisionRecord, bars: DailyBar[] | null, now = new Date()): DecisionPerformance {
  if (!record.ticker || record.priceAtDecision === null || !bars || bars.length === 0) return incomplete(record, now);

  const decisionIndex = findDecisionBarIndex(bars, record.timestamp);
  if (decisionIndex === null) return incomplete(record, now);

  const decisionPrice = record.priceAtDecision;
  const returnAt = (days: number) => computeReturnAt(bars, decisionIndex, decisionPrice, days);
  const window20 = computeMaxDrawdownGain(bars, decisionIndex, decisionPrice, 20);
  const window60 = computeMaxDrawdownGain(bars, decisionIndex, decisionPrice, 60);
  const lastUsedIndex = Math.min(bars.length - 1, decisionIndex + 250);

  return {
    decisionId: record.id,
    ticker: record.ticker,
    decision: record.decision,
    decisionPrice,
    decisionAt: record.timestamp,
    shortGate: record.shortTermSnapshot?.gate ?? null,
    midGate: record.midTermSnapshot?.gate ?? null,
    longGate: record.longTermSnapshot?.gate ?? null,
    tripleGate: record.tripleGateSnapshot ?? null,
    return1d: returnAt(1), return5d: returnAt(5), return20d: returnAt(20),
    return60d: returnAt(60), return120d: returnAt(120), return250d: returnAt(250),
    maxDrawdown20d: window20.maxDrawdownPct, maxDrawdown60d: window60.maxDrawdownPct,
    maxGain20d: window20.maxGainPct, maxGain60d: window60.maxGainPct,
    evaluatedThrough: bars[lastUsedIndex]?.date ?? null,
    dataStatus: "VALID",
    updatedAt: now.toISOString(),
  };
}
