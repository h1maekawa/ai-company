import type { ContentPlatform } from "../brandProfile";
import { growthConfidence } from "../../note/growthLoop";
import type { Learning } from "../learning/types";
import type { PlatformExperiment, PlatformMetricKey } from "./types";

export function learningEvidence(input: {
  learning: Learning;
  platform: ContentPlatform;
  metricKeys: PlatformMetricKey[];
  evidenceCount: number;
  hypothesisKey?: string;
  experimentId?: string;
}): Learning {
  return {
    ...input.learning,
    platform: input.platform,
    metricKeys: [...input.metricKeys],
    evidenceCount: input.evidenceCount,
    confidence: growthConfidence(input.evidenceCount),
    hypothesisKey: input.hypothesisKey,
    experimentId: input.experimentId,
    status: "candidate",
  };
}

/** Analysis-only candidate. One experiment has exactly one main variableKey. */
export function createExperimentCandidate(input: {
  id: string;
  platform: ContentPlatform;
  hypothesis: string;
  variableKey: string;
  controlValue?: string;
  experimentValue: string;
  primaryMetric: PlatformMetricKey;
  sourceLearningIds: string[];
  createdAt: string;
}): PlatformExperiment {
  return { ...input, sourceLearningIds: [...input.sourceLearningIds], status: "candidate" };
}
