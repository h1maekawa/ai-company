/**
 * Creator Learning（X Creator Thinking Model / PR-XT2）。
 *
 * section3: PerformanceとCreator Learningを型レベルで分離する。
 *  - Performance Learning（届け方の学習）は既存 content/learning/{types,store}.ts と
 *    note/automation/xStrategyLearning.ts（ContentGrowthStrategy.xAutoLearningHistory）のまま。
 *    ここでは一切複製しない（参照のみ）。
 *  - Creator Learning（前川本人ならどう考える・どう書くかの学習）がこのファイルの対象。
 *
 * 第二Learning Storeは作らない。CreatorLearningArtifactは新規の学習対象
 * （既存Learning型には無い概念）であり、保存先は creatorLearningStore.ts の1箇所のみ。
 *
 * section2の最重要原則: Performance ≠ Creator Preference。
 * バズった（Performance HIGH）からといって creatorFit を自動で HIGH にしない。
 */

import type { CreatorFitEvaluation } from "./types";

/**
 * mobile-ceo/controlCenter.HumanDecisionFeedback の構造的部分型。
 * 実際の呼び出し側は本物のHumanDecisionFeedbackを渡す（構造的に互換）。
 * このモジュールをcontent/creator-thinking配下だけでビルド・テストできるよう、
 * company/mobile-ceoへの直接依存（import）を避けるための意図的な選択。
 */
type HumanDecisionFeedbackLike = {
  departmentId?: string;
  note: string | null;
  decision: "APPROVED" | "HOLD" | "REJECTED";
  targetType: string;
  targetId: string;
  createdAt: string;
};

/**
 * review/types.ReviewFeedback の構造的部分型（同様の理由でimportを避ける）。
 */
type ReviewFeedbackLike = {
  kind: string;
  itemId: string;
  reason: string;
  decision: "approve" | "reject" | "edit_approve";
  decidedAt: string;
};

export type CreatorLearningSourceType =
  | "PERFORMANCE"
  | "HUMAN_FEEDBACK"
  | "CREATOR_FIT"
  | "REPEATED_BEHAVIOR";

export type CreatorLearningCategory =
  | "WRITING"
  | "TOPIC"
  | "INTERPRETATION"
  | "STRUCTURE"
  | "CTA"
  | "HOOK"
  | "RESEARCH_DEPTH";

/** Performanceとは独立した「前川らしさ」の評価。Performanceから自動算出しない（section2/9） */
export type CreatorFitLabel = "HIGH" | "LOW" | "UNKNOWN";

export type CreatorLearningConfidence = "low" | "medium" | "high";

export type CreatorLearningFreshness = "FRESH" | "STALE" | "UNKNOWN";

/** section4の最低項目 */
export type CreatorLearningArtifact = {
  id: string;
  sourceType: CreatorLearningSourceType;
  sourceIds: string[];
  category: CreatorLearningCategory;
  /** 観測事実。解釈を含まない */
  observation: string;
  /** 観測から読み取れる前川の好み（断定しない。candidateとして保持） */
  inferredPreference: string;
  evidenceRefs: string[];
  creatorFit: CreatorFitLabel;
  confidence: CreatorLearningConfidence;
  sampleCount: number;
  freshness: CreatorLearningFreshness;
  createdAt: string;
};

function freshnessOf(observedAt: string, now: Date, staleDays = 30): CreatorLearningFreshness {
  const observed = new Date(observedAt).getTime();
  if (!Number.isFinite(observed)) return "UNKNOWN";
  const ageDays = (now.getTime() - observed) / 86_400_000;
  if (ageDays < 0) return "UNKNOWN";
  return ageDays <= staleDays ? "FRESH" : "STALE";
}

/** sampleCountからの機械的な確信度。単一の明示Human Feedbackはこの関数を使わず常にhighとする（section15: Evidence優先度1位） */
function confidenceFromSampleCount(sampleCount: number): CreatorLearningConfidence {
  if (sampleCount >= 5) return "high";
  if (sampleCount >= 2) return "medium";
  return "low";
}

function makeId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 9)}`;
}

/* ─── category分類（キーワードヒューリスティック。推測で断定せずWRITINGを既定にする） ─── */

const CATEGORY_TERMS: Array<[CreatorLearningCategory, RegExp]> = [
  ["RESEARCH_DEPTH", /(もっと調べ|深掘り|調査が浅|リサーチ不足|裏取り)/u],
  ["HOOK", /(フック|書き出し|冒頭|つかみ)/u],
  ["CTA", /(CTA|行動を促|フォローして|リンクを踏|誘導)/iu],
  ["STRUCTURE", /(構成|構造|見出し|段落|順番)/u],
  ["INTERPRETATION", /(解釈|考え方|視点|捉え方|意味づけ)/u],
  ["TOPIC", /(トピック|テーマ|題材|扱うべき)/u],
];

/** feedbackTextからcategoryを推定する。該当が無ければWRITING（文体・表現）を既定とする */
export function classifyCreatorLearningCategory(feedbackText: string): CreatorLearningCategory {
  for (const [category, pattern] of CATEGORY_TERMS) {
    if (pattern.test(feedbackText)) return category;
  }
  return "WRITING";
}

/* ─── Human Feedback Evidence（新規Storeではない。既存Storeからの読み取り専用Projection） ─── */

export type CreatorFeedbackSentiment = "positive" | "negative" | "neutral" | "mixed";
export type CreatorFeedbackExplicitness = "EXPLICIT" | "IMPLICIT";

/**
 * section5が要求するフィールド形状。これ自体は永続化しない（保存は既存のHumanDecisionFeedback /
 * ReviewFeedbackのまま）。CreatorLearningArtifact（HUMAN_FEEDBACK種別）を組み立てる入力として使う。
 */
export type CreatorHumanFeedbackEvidence = {
  feedbackText: string;
  targetContentId: string | null;
  targetSkillId: string | null;
  category: CreatorLearningCategory;
  sentiment: CreatorFeedbackSentiment;
  explicitness: CreatorFeedbackExplicitness;
  createdAt: string;
};

/**
 * mobile-ceo/controlCenterのHumanDecisionFeedback（departmentId:"creator"）からEvidenceを写す。
 * Safety/Authority/Investment Trade Ruleは一切参照しない（section5後段）。
 */
export function projectHumanDecisionFeedback(
  record: HumanDecisionFeedbackLike
): CreatorHumanFeedbackEvidence | null {
  if (record.departmentId !== "creator") return null;
  const text = record.note?.trim() ?? "";
  const sentiment: CreatorFeedbackSentiment =
    record.decision === "APPROVED" ? "positive" : record.decision === "REJECTED" ? "negative" : "neutral";
  return {
    feedbackText: text,
    targetContentId: null,
    targetSkillId: record.targetType === "skill-candidate" || record.targetType === "skill-improvement"
      ? record.targetId
      : null,
    category: classifyCreatorLearningCategory(text),
    sentiment,
    explicitness: text.length > 0 ? "EXPLICIT" : "IMPLICIT",
    createdAt: record.createdAt,
  };
}

/**
 * review/feedbackStore の ReviewFeedback（x_draft向け、reasonが本人の訂正理由）からEvidenceを写す。
 * reasonが空のapproveはフィードバックとして扱わない（学習材料が無いため）。
 */
export function projectReviewFeedback(record: ReviewFeedbackLike): CreatorHumanFeedbackEvidence | null {
  if (record.kind !== "x_draft") return null;
  const text = record.reason?.trim() ?? "";
  if (!text) return null;
  const sentiment: CreatorFeedbackSentiment =
    record.decision === "reject" ? "negative" : record.decision === "edit_approve" ? "mixed" : "neutral";
  const [, sourceId] = record.itemId.split(":");
  return {
    feedbackText: text,
    targetContentId: sourceId ?? null,
    targetSkillId: null,
    category: classifyCreatorLearningCategory(text),
    sentiment,
    explicitness: "EXPLICIT",
    createdAt: record.decidedAt,
  };
}

/* ─── CreatorLearningArtifact builder（sourceType別） ─── */

/** section15 Evidence優先度1位: 明示Human Feedbackは単一観測でも confidence: high とする */
export function buildCreatorLearningFromHumanFeedback(
  evidence: CreatorHumanFeedbackEvidence,
  evidenceRefId: string,
  now = new Date()
): CreatorLearningArtifact {
  return {
    id: makeId("creator_learning"),
    sourceType: "HUMAN_FEEDBACK",
    sourceIds: [evidenceRefId],
    category: evidence.category,
    observation: evidence.feedbackText,
    inferredPreference:
      evidence.sentiment === "negative"
        ? `避けるべき: ${evidence.feedbackText}`
        : evidence.sentiment === "positive"
        ? `好ましい: ${evidence.feedbackText}`
        : evidence.feedbackText,
    evidenceRefs: [evidenceRefId],
    // Human Feedbackそのものはcreator本人の発言であり、Performanceとは無関係にHIGH
    creatorFit: "HIGH",
    confidence: "high",
    sampleCount: 1,
    freshness: freshnessOf(evidence.createdAt, now),
    createdAt: now.toISOString(),
  };
}

/** Creator Fit評価（Performanceフィールドを持たない既存CreatorFitEvaluation）からの学習 */
export function buildCreatorLearningFromCreatorFit(
  evaluation: CreatorFitEvaluation,
  category: CreatorLearningCategory,
  now = new Date()
): CreatorLearningArtifact {
  return {
    id: makeId("creator_learning"),
    sourceType: "CREATOR_FIT",
    sourceIds: [evaluation.id],
    category,
    observation: evaluation.reason,
    inferredPreference: evaluation.fit
      ? "Creator Fit criteriaを満たした特徴"
      : "Creator Fit criteriaを満たさなかった特徴",
    evidenceRefs: [evaluation.id],
    creatorFit: evaluation.fit ? "HIGH" : "LOW",
    confidence: "medium",
    sampleCount: 1,
    freshness: freshnessOf(evaluation.evaluatedAt, now),
    createdAt: now.toISOString(),
  };
}

/**
 * section3A/9: Performance起点の学習はcreatorFitを絶対にHIGHへ推測しない（常にUNKNOWN）。
 * 「どう届ければ伸びるか」の学習であり、「前川らしいか」は別軸（section9: Performance Strategy
 * Candidateとしてのみ利用可能。Creator Skillには自動昇格しない）。
 */
export function buildCreatorLearningFromPerformance(input: {
  sourceIds: string[];
  category: CreatorLearningCategory;
  observation: string;
  sampleCount: number;
  observedAt: string;
}, now = new Date()): CreatorLearningArtifact {
  return {
    id: makeId("creator_learning"),
    sourceType: "PERFORMANCE",
    sourceIds: input.sourceIds,
    category: input.category,
    observation: input.observation,
    inferredPreference: "Performance相関のみ。Creator Preferenceとしては未確認",
    evidenceRefs: input.sourceIds,
    creatorFit: "UNKNOWN",
    confidence: confidenceFromSampleCount(input.sampleCount),
    sampleCount: input.sampleCount,
    freshness: freshnessOf(input.observedAt, now),
    createdAt: now.toISOString(),
  };
}

/**
 * section17: 複数のCreatorLearningArtifact（HUMAN_FEEDBACK/CREATOR_FIT）が同一category・
 * 同一方向で繰り返し観測された場合の二次Artifact。新しいStoreは作らず、同じ配列に追記するだけ。
 */
export function buildRepeatedBehaviorArtifact(
  group: CreatorLearningArtifact[],
  now = new Date()
): CreatorLearningArtifact | null {
  if (group.length < 2) return null;
  const category = group[0].category;
  if (!group.every((item) => item.category === category)) return null;
  const creatorFits = new Set(group.map((item) => item.creatorFit));
  // 混在（HIGHとLOWが両方ある）はUNKNOWNとして安全側に倒す。推測でどちらかに寄せない
  const creatorFit: CreatorFitLabel = creatorFits.size === 1 ? (group[0].creatorFit) : "UNKNOWN";
  const sampleCount = group.reduce((sum, item) => sum + item.sampleCount, 0);
  const oldest = group.reduce((min, item) => (item.createdAt < min ? item.createdAt : min), group[0].createdAt);
  return {
    id: makeId("creator_learning"),
    sourceType: "REPEATED_BEHAVIOR",
    sourceIds: group.flatMap((item) => item.sourceIds),
    category,
    observation: `${category}で${group.length}件の独立した観測が繰り返された`,
    inferredPreference: group[group.length - 1].inferredPreference,
    evidenceRefs: group.flatMap((item) => item.evidenceRefs),
    creatorFit,
    confidence: confidenceFromSampleCount(sampleCount),
    sampleCount,
    freshness: freshnessOf(oldest, now),
    createdAt: now.toISOString(),
  };
}
