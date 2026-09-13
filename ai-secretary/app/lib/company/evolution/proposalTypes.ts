/**
 * 組織変更の提案 — v3.1 Phase 3 §9 / §10 / §17 / §23
 *
 * Pattern（観測）と Proposal（提案）は別物として扱う（§9）。
 * 観測をそのままCEOへ見せると、「3回同じ仕事をした」が
 * 「社員を増やすべき」に化けて伝わる。間に評価を挟む。
 */

import type { Evidence, Pattern } from "./detection/types";

/** §10。Phase 3 で生成するのは一部だが、型としては全種類を表現できる */
export type ProposalType =
  | "NEW_DEPARTMENT"
  | "REMOVE_DEPARTMENT"
  | "NEW_AGENT"
  | "REMOVE_AGENT"
  | "SPLIT_AGENT"
  | "MERGE_AGENT"
  | "NEW_SKILL"
  | "REMOVE_SKILL"
  | "MERGE_SKILL"
  | "NEW_WORKFLOW"
  | "MODIFY_WORKFLOW"
  | "PROMPT_UPDATE"
  | "MEMORY_SCOPE_CHANGE";

export const PROPOSAL_TYPE_LABELS: Record<ProposalType, string> = {
  NEW_DEPARTMENT: "新しい部署を作る",
  REMOVE_DEPARTMENT: "部署を廃止する",
  NEW_AGENT: "新しいAI社員を置く",
  REMOVE_AGENT: "AI社員を廃止する",
  SPLIT_AGENT: "AI社員を分割する",
  MERGE_AGENT: "AI社員を統合する",
  NEW_SKILL: "Skillを作る",
  REMOVE_SKILL: "Skillを廃止する",
  MERGE_SKILL: "Skillを統合する",
  NEW_WORKFLOW: "Workflowを作る",
  MODIFY_WORKFLOW: "Workflowを変更する",
  PROMPT_UPDATE: "プロンプトを改善する",
  MEMORY_SCOPE_CHANGE: "参照範囲を変更する",
};

/** §17 Lifecycle。Phase 3 で使うのは上3つまで */
export type ProposalStatus =
  | "WATCHING"
  | "PROPOSED"
  | "HIGH_PRIORITY"
  | "APPROVED"
  | "REJECTED"
  | "IMPLEMENTED"
  | "DISMISSED"
  | "STALE";

/**
 * §23 組織を増やすこと自体のコスト。
 * 同程度の改善なら Skill < Agent < Department の順で軽い変更を選ぶ。
 */
export type ComplexityCost = "low" | "medium" | "high";

export const COMPLEXITY_BY_TYPE: Record<ProposalType, ComplexityCost> = {
  NEW_SKILL: "low",
  MERGE_SKILL: "low",
  REMOVE_SKILL: "low",
  PROMPT_UPDATE: "low",
  MEMORY_SCOPE_CHANGE: "low",
  MODIFY_WORKFLOW: "low",
  NEW_WORKFLOW: "medium",
  NEW_AGENT: "medium",
  SPLIT_AGENT: "medium",
  MERGE_AGENT: "medium",
  REMOVE_AGENT: "medium",
  NEW_DEPARTMENT: "high",
  REMOVE_DEPARTMENT: "high",
};

/**
 * §24 推奨の優先順位。数字が小さいほど先に試すべき軽い手段。
 * 同じ問題に複数の提案が立つとき、この順で軽い方を残す。
 */
export const RECOMMENDATION_RANK: Record<ProposalType, number> = {
  PROMPT_UPDATE: 1,
  MEMORY_SCOPE_CHANGE: 1,
  MERGE_SKILL: 2,
  REMOVE_SKILL: 2,
  NEW_SKILL: 3,
  MODIFY_WORKFLOW: 4,
  NEW_WORKFLOW: 5,
  SPLIT_AGENT: 6,
  NEW_AGENT: 6,
  MERGE_AGENT: 6,
  REMOVE_AGENT: 6,
  NEW_DEPARTMENT: 7,
  REMOVE_DEPARTMENT: 7,
};

/** §12 配点の内訳。合計で100点 */
export type ScoreBreakdown = {
  taskFrequency: number;
  timeSaving: number;
  qualityImprovement: number;
  costReduction: number;
  ceoIntervention: number;
  errorReduction: number;
  strategicValue: number;
};

export const SCORE_WEIGHTS: ScoreBreakdown = {
  taskFrequency: 20,
  timeSaving: 20,
  qualityImprovement: 15,
  costReduction: 10,
  ceoIntervention: 15,
  errorReduction: 10,
  strategicValue: 10,
};

/**
 * Personal Company から見た影響 — Phase 5 §32 / §33 / §35
 *
 * すべて optional。Phase 3 の Proposal Schema を壊さない。
 * §35 のとおり、推定根拠が無ければ入れない（数字を捏造しない）。
 * 値が無いこと自体が「まだ測れていない」という情報になる。
 */
export type PersonalImpact = {
  expectedRevenueImpactYen?: number;
  expectedSavingsImpactYen?: number;
  expectedAssetImpactYen?: number;
  expectedTimeSavedMinutes?: number;
  /** 0〜1。根拠が薄ければ低くする */
  confidence?: number;
  /** 見積もれなかった項目の理由。UNKNOWN を明示するため */
  unknownReasons?: string[];
};

export type ExpectedImpact = {
  /** 期待できること。数値が出せないものは説明のみ */
  description: string;
  /** 対象AI社員の負荷削減（%）。推定できなければ null */
  loadReductionPct: number | null;
  /** 処理時間の短縮（%）。推定できなければ null */
  timeReductionPct: number | null;
};

export type OrganizationProposal = {
  id: string;
  /** §16 重複判定のキー。同じ提案は同じ値になる */
  fingerprint: string;
  type: ProposalType;
  title: string;
  summary: string;

  /** §11 Evidence First。根拠のない提案は作らない */
  evidence: Evidence[];
  /** どの観測から生まれたか */
  sourcePatternKeys: string[];

  targetDepartment?: string;
  targetAgent?: string;
  targetSkill?: string;
  targetWorkflow?: string;

  score: number;
  scoreBreakdown: ScoreBreakdown;
  /** §14 0〜1。データが薄いと低くなる */
  confidence: number;
  complexityCost: ComplexityCost;
  /** §24 軽い手段ほど小さい */
  recommendationRank: number;

  expectedImpact: ExpectedImpact;
  /** Personal Company としての影響（Phase 5 §32）。Optional */
  personalImpact?: PersonalImpact;
  /** 実施した場合のリスク。空にしない */
  risks: string[];

  sampleSize: number;
  observationWindowDays: number;

  status: ProposalStatus;
  /** §18 却下の学習準備。Phase 3 ではschemaのみ */
  rejectedAt?: string;
  rejectionReason?: string;
  cooldownUntil?: string;

  /** §20 履歴。上書きで消さない */
  history: ProposalHistoryEntry[];

  createdAt: string;
  updatedAt: string;
};

export type ProposalHistoryEntry = {
  at: string;
  /** 何が変わったか */
  change: "created" | "score_changed" | "status_changed" | "evidence_updated";
  score?: number;
  confidence?: number;
  status?: ProposalStatus;
  note?: string;
};

/** Patternから提案対象を引き継ぐ */
export function targetsFromPattern(pattern: Pattern): Pick<
  OrganizationProposal,
  "targetDepartment" | "targetAgent" | "targetSkill"
> {
  return {
    targetDepartment: pattern.target.departmentId,
    targetAgent: pattern.target.agentId,
    targetSkill: pattern.target.skillId,
  };
}
