import { buildDecisionPerformanceSummary } from "./summary";
import type { DecisionPerformance, DecisionPerformanceSegments } from "./types";

function groupBy<T extends string>(performances: DecisionPerformance[], keyOf: (item: DecisionPerformance) => T | null): Map<T, DecisionPerformance[]> {
  const groups = new Map<T, DecisionPerformance[]>();
  for (const item of performances) {
    const key = keyOf(item);
    if (key === null) continue;
    const list = groups.get(key) ?? [];
    list.push(item);
    groups.set(key, list);
  }
  return groups;
}

function summarizeGroups<T extends string>(groups: Map<T, DecisionPerformance[]>): Partial<Record<T, ReturnType<typeof buildDecisionPerformanceSummary>>> {
  const result: Partial<Record<T, ReturnType<typeof buildDecisionPerformanceSummary>>> = {};
  for (const [key, items] of groups) result[key] = buildDecisionPerformanceSummary(items);
  return result;
}

/**
 * Minimum segmentation required by INVESTMENT_THINKING_MODEL.md: by Decision (GO/WAIT/PASS),
 * by each Horizon gate, and by Triple Gate. (Theme/Sector/Country/Market Regime segmentation is
 * deferred — MVP per the task's own "scopeが膨らむ場合はMVP優先" allowance.)
 */
export function buildDecisionPerformanceSegments(performances: DecisionPerformance[]): DecisionPerformanceSegments {
  return {
    byDecision: summarizeGroups(groupBy(performances, (item) => item.decision)),
    byShortGate: summarizeGroups(groupBy(performances, (item) => item.shortGate)),
    byMidGate: summarizeGroups(groupBy(performances, (item) => item.midGate)),
    byLongGate: summarizeGroups(groupBy(performances, (item) => item.longGate)),
    byTripleGate: summarizeGroups(groupBy(performances, (item) => item.tripleGate)),
  };
}
