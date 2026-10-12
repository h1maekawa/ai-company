/**
 * Creator Fit（section8）。
 * 「前川本人らしいか」の評価で、Performance Scoreとは独立させる。
 * 高PerformanceでもCreator Fitが低い投稿を自動で学習ルールへ昇格させないための判定を提供する。
 */

import { CREATOR_FIT_CRITERIA } from "./types";
import type { CreatorFitAssessment, CreatorFitEvaluation } from "./types";

export function evaluateCreatorFit(input: {
  subjectId: string;
  assessment: CreatorFitAssessment;
  reason: string;
}): CreatorFitEvaluation {
  const fit = CREATOR_FIT_CRITERIA.every((criterion) => input.assessment[criterion] === true);
  return {
    id: `creatorfit_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`,
    subjectId: input.subjectId,
    assessment: input.assessment,
    reason: input.reason,
    fit,
    evaluatedAt: new Date().toISOString(),
  };
}
