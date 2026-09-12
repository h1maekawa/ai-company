/**
 * 検出器の登録簿 — v3.1 Phase 3 §3
 *
 * 新しい Pattern Type を足すときは、検出器を1つ書いてここへ並べるだけ。
 * 分岐を増やす形にしないのは、検出器ごとに独立してテストできるようにするため。
 */

import type { Detector } from "./types";
import {
  repeatedTaskDetector,
  skillCandidateDetector,
  workflowCandidateDetector,
} from "./repetition";
import {
  agentMergeDetector,
  agentSplitDetector,
  newAgentDetector,
  newDepartmentDetector,
} from "./organization";
import {
  apiCostDetector,
  failureRateDetector,
  humanInterventionDetector,
  retryRateDetector,
} from "./quality";

export const DETECTORS: Detector[] = [
  repeatedTaskDetector,
  skillCandidateDetector,
  workflowCandidateDetector,
  newAgentDetector,
  agentSplitDetector,
  agentMergeDetector,
  newDepartmentDetector,
  humanInterventionDetector,
  failureRateDetector,
  retryRateDetector,
  apiCostDetector,
];

export * from "./types";
