/**
 * Creator Thinking Model Contract（X Creator Thinking Model / PR-XT1）。
 *
 * これは第二のResearch/Knowledge/Skill/Performance SSOTではない。
 *  - Research事実は company/research/types.ts の IntelligenceArtifact（facts/interpretation/unknowns）
 *    を FactRef で参照するだけで、statementを除き値を複製しない。
 *  - Investment関連は investmentProjection.ts 経由の Read-only Projection のみを持つ。
 *    Investment Thinking Model自体はコピーしない（投資ロジックは一切書かない）。
 *  - Writing Personality は note/types.ts の Brand.personality（BrandPersonality）を参照する。
 *
 * Versioning（DRAFT→ACTIVE→DEPRECATEDの昇格運用・履歴管理）はPR-XT2で扱う。
 * ここではcontractの形と、DRAFT状態の初期値を作る関数だけを提供する。
 */

import type { BrandPersonality } from "../../note/types";
import type { FactRef, ResearchFreshness } from "../../company/research/types";

export type CreatorThinkingModelStatus = "DRAFT" | "ACTIVE" | "DEPRECATED";

export type CreatorThinkingModel = {
  id: string;
  version: string;
  status: CreatorThinkingModelStatus;
  owner: string;
  principles: string[];
  aiThinkingRules: string[];
  investmentProjectionRules: string[];
  /** note/types.ts の Brand.personality.writingRules をそのまま参照する（複製して持たない） */
  writingRules: string[];
  contentSelectionRules: string[];
  creatorFitRules: string[];
  learningRules: string[];
  sourceFeedbackIds: string[];
  createdAt: string;
  updatedAt: string;
  approvedBy?: string;
};

export function defaultCreatorThinkingModel(input: {
  id: string;
  owner: string;
  personality: BrandPersonality;
  aiThinkingRules: readonly string[];
  creatorFitRules: readonly string[];
  investmentProjectionRules: readonly string[];
}): CreatorThinkingModel {
  const now = new Date().toISOString();
  return {
    id: input.id,
    version: "0.1.0",
    // AIが自由に書き換えない。ACTIVEへの昇格は常にHuman Review（section14）
    status: "DRAFT",
    owner: input.owner,
    principles: [
      "前川本人の代わりにResearchし、前川本人の考え方で意味を解釈し、前川本人の自然な言葉に変換し、結果から学習する",
      "PerformanceのためにCreator Thinkingを破壊しない",
    ],
    aiThinkingRules: [...input.aiThinkingRules],
    investmentProjectionRules: [...input.investmentProjectionRules],
    writingRules: input.personality.writingRules,
    contentSelectionRules: [],
    creatorFitRules: [...input.creatorFitRules],
    learningRules: [],
    sourceFeedbackIds: [],
    createdAt: now,
    updatedAt: now,
  };
}

/* ─── AI Thinking Model（section5/6） ──────────────────── */

/** Fact段落。statementは要約・言い換えだが、必ずfactRefsで根拠のあるFactを指す（空なら根拠なしの断定を禁止） */
export type FactRefBacked = {
  statement: string;
  factRefs: FactRef[];
};

/**
 * section6: AI Research Output Contract。
 * Source/Evidence/Freshnessを保持し、UNKNOWNは明示的なstring[]としてのみ持つ（推測で埋めない）。
 */
export type AIThinkingModelOutput = {
  id: string;
  /** IntelligenceArtifact.topicKeyへの参照。Research本体はコピーしない */
  sourceTopicKey: string;
  fact: FactRefBacked;
  whyItMatters: string;
  practicalImpact: string;
  businessImpact: string;
  personalOrSmeImpact: string;
  aiCompanyUseCase: string;
  opportunity: string;
  risk: string;
  currentInterpretation: string;
  hypothesis: string[];
  unknown: string[];
  freshness: ResearchFreshness;
  evaluatedAt: string;
};

/** section5の思考順序。builderが入力として要求する10ステップ（この配列自体が仕様） */
export const AI_THINKING_STEPS = [
  "whatHappened",
  "whatBecamePossible",
  "whatChangedFromBefore",
  "whoseWorkChanges",
  "practicalUseCase",
  "personalOrSmeImpact",
  "businessOpportunity",
  "aiCompanyApplication",
  "whatMightHappenNext",
  "unknown",
] as const;
export type AIThinkingStep = (typeof AI_THINKING_STEPS)[number];

/** section5の10ステップに対応する回答。AI Thinking Modelの本体入力 */
export type AIThinkingStepAnswers = {
  whatHappened: FactRefBacked;
  whatBecamePossible: string;
  whatChangedFromBefore: string;
  whoseWorkChanges: string;
  practicalUseCase: string;
  personalOrSmeImpact: string;
  businessImpact: string;
  businessOpportunity: string;
  aiCompanyApplication: string;
  whatMightHappenNext: string;
  unknown: string[];
  /** 10ステップの外側にある解釈レイヤー。断定できない内容はこことhypothesisへ、Factへは混ぜない */
  currentInterpretation: string;
  hypothesis: string[];
  risk: string;
};

/* ─── Content Thesis（section17） ──────────────────────── */

/**
 * 各投稿のPurpose（section9）。既存の ContentPurpose（note/research/types.ts、
 * reach/trust/note-bridge/affiliate/paid-note/x-monetization）や ContentGoal とは別軸。
 * 既存軸の置き換えではなく、Creator Thinking Model独自の目的分類として新設する。
 * 既存軸との対応付けはUNKNOWNのため、ここでは推測しない（将来PRで必要なら検討）。
 */
export type CreatorContentPurpose = "LEARN" | "GROW" | "TRUST" | "MONETIZE";

/** Draft前に必ず生成する。ResearchItemから直接本文を生成しないための中間契約 */
export type ContentThesis = {
  id: string;
  /** AIThinkingModelOutput.id または InvestmentProjection.sourceTopicKey への参照 */
  sourceThinkingOutputId: string;
  whatHappened: string;
  whyItMatters: string;
  myInterpretation: string;
  audienceTakeaway: string;
  unknownCaveat: string[];
  intendedPurpose: CreatorContentPurpose;
  creatorFitReason: string;
  createdAt: string;
};

/* ─── Creator Fit（section8） ──────────────────────────── */

/** section8の最低評価項目。Performance Scoreとは型レベルで完全に分離する */
export const CREATOR_FIT_CRITERIA = [
  "interest",
  "personalLearning",
  "addsInterpretation",
  "notPlainRepost",
  "consistentWithPastThinking",
  "naturalVoice",
] as const;
export type CreatorFitCriterion = (typeof CREATOR_FIT_CRITERIA)[number];

export type CreatorFitAssessment = Record<CreatorFitCriterion, boolean>;

/**
 * Creator Fitの評価結果。impression/engagement/click/follower/conversion/revenueなど
 * Performance系フィールドを一切持たない（section8: Performanceと独立させる）。
 */
export type CreatorFitEvaluation = {
  id: string;
  subjectId: string;
  assessment: CreatorFitAssessment;
  reason: string;
  /** 全criteriaを満たした場合のみtrue。高Performanceでも自動でtrueにしない */
  fit: boolean;
  evaluatedAt: string;
};

/* ─── Investment Thinking Model Projection（section3/4） ─── */

/**
 * Investment Thinking ModelのRead-only Projection。
 * company/research/types.ts の IntelligenceArtifact.investmentExt、
 * note/investing/learningBrief.ts の InvestmentLearningBrief を参照するだけの型。
 * 書き込み・保存関数はinvestmentProjection.tsにも一切持たない。
 */
export type InvestmentProjection = {
  sourceTopicKey: string;
  marketStructure: { demandChain: string[]; valueChain: string[] };
  bottlenecks: { name: string; constraintTypes: string[]; factRefs: FactRef[] }[];
  candidateCompanies: { name: string; ticker?: string; role: string; factRefs: FactRef[] }[];
  risk: string[];
  fact: { factRefs: FactRef[] };
  interpretation: string[];
  hypothesis?: string;
  unknown: string[];
};
