/**
 * Learning / Next Content Engine — Performance → Learning → Recommendation → Next Content のLoop。
 * ObservationとInterpretationを分離する。AIの推論は事実として保存しない（常にcandidate）。
 */

import type { ContentGoal } from "../../note/research/types";

export type ApprovalStatus = "candidate" | "approved" | "rejected";

export type Learning = {
  id: string;
  period: string;

  sourceContentIds: string[];
  sourcePerformanceIds: string[];

  /** 観測事実（数値の比較など、解釈を含まない） */
  observation: string;
  /** その観測から読み取れる可能性（解釈。断定しない） */
  interpretation: string;

  confidence?: "low" | "medium" | "high";
  actionCandidate?: string;

  status: ApprovalStatus;
  approvedAt?: string;
  createdAt: string;
};

export function createLearningCandidate(input: {
  period: string;
  sourceContentIds: string[];
  sourcePerformanceIds: string[];
  observation: string;
  interpretation: string;
  confidence?: Learning["confidence"];
  actionCandidate?: string;
}): Learning {
  return {
    id: `learn_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`,
    period: input.period,
    sourceContentIds: input.sourceContentIds,
    sourcePerformanceIds: input.sourcePerformanceIds,
    observation: input.observation,
    interpretation: input.interpretation,
    confidence: input.confidence,
    actionCandidate: input.actionCandidate,
    // AIが作った直後は必ずcandidate
    status: "candidate",
    createdAt: new Date().toISOString(),
  };
}

export function approveLearning(learning: Learning): Learning {
  return { ...learning, status: "approved", approvedAt: new Date().toISOString() };
}

export function rejectLearning(learning: Learning): Learning {
  return { ...learning, status: "rejected" };
}

/* ─── Content Recommendation ─────────────────────────── */

export type RecommendationStatus = "suggested" | "selected" | "rejected" | "converted";
export type RecommendationChannel = "note" | "x" | "note-then-x" | "x-then-note";

export type ContentRecommendation = {
  id: string;
  sourceLearningIds: string[];

  channel: RecommendationChannel;
  topic: string;
  angle?: string;

  contentGoal?: ContentGoal;
  recommendedOfferId?: string;

  reason: string;
  evidence: string[];

  priority: number;

  status: RecommendationStatus;
  createdAt: string;
  /** 採用時に生成された ArticleSession / X Draft の id */
  convertedToId?: string;
};

export function createRecommendation(input: {
  sourceLearningIds: string[];
  channel: RecommendationChannel;
  topic: string;
  angle?: string;
  contentGoal?: ContentGoal;
  recommendedOfferId?: string;
  reason: string;
  evidence?: string[];
  priority?: number;
}): ContentRecommendation {
  return {
    id: `rec_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`,
    sourceLearningIds: input.sourceLearningIds,
    channel: input.channel,
    topic: input.topic,
    angle: input.angle,
    contentGoal: input.contentGoal,
    recommendedOfferId: input.recommendedOfferId,
    reason: input.reason,
    evidence: input.evidence ?? [],
    priority: input.priority ?? 3,
    status: "suggested",
    createdAt: new Date().toISOString(),
  };
}

/* ─── Content Plan（Content Calendar） ───────────────── */

export type ContentPlanStatus = "idea" | "planned" | "draft" | "approved" | "published" | "skipped";

export type ContentPlan = {
  id: string;
  channel: "note" | "x";
  topic: string;
  goal?: ContentGoal;

  offerId?: string;
  plannedDate?: string;

  status: ContentPlanStatus;
  createdAt: string;
  updatedAt: string;
};

export function createContentPlan(input: {
  channel: "note" | "x";
  topic: string;
  goal?: ContentGoal;
  offerId?: string;
  plannedDate?: string;
}): ContentPlan {
  const now = new Date().toISOString();
  return {
    id: `plan_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`,
    channel: input.channel,
    topic: input.topic,
    goal: input.goal,
    offerId: input.offerId,
    plannedDate: input.plannedDate,
    status: "idea",
    createdAt: now,
    updatedAt: now,
  };
}
