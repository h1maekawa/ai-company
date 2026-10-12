import { loadDecisionPerformanceReport } from "../decisionPerformance/loader";
import { loadInvestmentDecisions } from "../store";
import { buildFactorPerformances } from "./factorPerformance";
import { buildLearningCandidates } from "./learningCandidate";
import type { InvestmentLearningReport } from "./types";

/**
 * Read-only loader: reuses the existing Decision Store and the Decision Performance report
 * (which itself reuses the existing market-data provider). Never writes anything, and never
 * applies a candidate — see learningCandidate.ts.
 */
export async function loadInvestmentLearningReport(now = new Date()): Promise<InvestmentLearningReport> {
  const [records, performanceReport] = await Promise.all([loadInvestmentDecisions(), loadDecisionPerformanceReport(now)]);
  const factorPerformances = buildFactorPerformances(records, performanceReport.performances);
  return {
    generatedAt: now.toISOString(),
    factorPerformances,
    candidates: buildLearningCandidates(factorPerformances),
  };
}
