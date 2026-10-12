import type { DecisionPerformance } from "../decisionPerformance/types";
import type { InvestmentHorizon } from "../horizon/types";
import type { InvestmentDecisionRecord } from "../types";
import { mean, pearson } from "./stats";
import type { FactorPerformance } from "./types";
import { MINIMUM_LEARNING_SAMPLE } from "../decisionPerformance/types";

/**
 * Which return window a horizon's factors are checked against. SHORT's own window is 1-20D, so
 * its factors are checked against return20d (matching the worked example in the PR brief:
 * "Relative Volumeが高かったGO候補の20D return"). MID checks against its own 60D window; LONG
 * checks against 120D — deliberately not 250D, so a LONG factor is scored once an outcome has
 * had time to play out without waiting the full multi-year horizon.
 */
const RETURN_FIELD_FOR_HORIZON: Record<InvestmentHorizon, keyof DecisionPerformance> = {
  SHORT: "return20d",
  MID: "return60d",
  LONG: "return120d",
};

const snapshotFor = (record: InvestmentDecisionRecord, horizon: InvestmentHorizon) =>
  horizon === "SHORT" ? record.shortTermSnapshot : horizon === "MID" ? record.midTermSnapshot : record.longTermSnapshot;

/**
 * Correlates each HorizonFactor's score (frozen on the Decision Snapshot) with the matching
 * Decision Performance return. Correlation != Causation (see types.ts).
 */
export function buildFactorPerformances(records: InvestmentDecisionRecord[], performances: DecisionPerformance[], minimumSample = MINIMUM_LEARNING_SAMPLE): FactorPerformance[] {
  const performanceById = new Map(performances.map((item) => [item.decisionId, item]));
  const results: FactorPerformance[] = [];

  for (const horizon of ["SHORT", "MID", "LONG"] as InvestmentHorizon[]) {
    const returnField = RETURN_FIELD_FOR_HORIZON[horizon];
    const factorKeys = new Set<string>();
    for (const record of records) for (const factor of snapshotFor(record, horizon)?.factors ?? []) factorKeys.add(factor.key);

    for (const factorKey of factorKeys) {
      const scores: number[] = [];
      const returns: number[] = [];
      for (const record of records) {
        const performance = performanceById.get(record.id);
        if (!performance || performance.dataStatus !== "VALID") continue;
        const factor = snapshotFor(record, horizon)?.factors.find((item) => item.key === factorKey);
        const returnValue = performance[returnField] as number | null;
        if (!factor?.known || factor.score === null || returnValue === null) continue;
        scores.push(factor.score);
        returns.push(returnValue);
      }

      const sampleSize = scores.length;
      results.push({
        horizon,
        factorKey,
        sampleSize,
        averageFactorScore: mean(scores),
        averageReturn: mean(returns),
        correlation: pearson(scores, returns),
        winRate: sampleSize === 0 ? null : Math.round((returns.filter((value) => value > 0).length / sampleSize) * 10000) / 100,
        status: sampleSize === 0 ? "DATA_INCOMPLETE" : sampleSize < minimumSample ? "INSUFFICIENT_SAMPLE" : "VALID",
      });
    }
  }
  return results;
}
