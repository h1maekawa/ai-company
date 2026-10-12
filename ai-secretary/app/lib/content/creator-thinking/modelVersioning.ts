/**
 * Creator Thinking Model Versioning / Model Change Candidate（X Creator Thinking Model / PR-XT2）。
 *
 * section11-16: AIはCreator Thinking Modelを自由に書き換えない。
 * Flow: Learning → SkillCandidate → Approved Skill → ModelChangeCandidate → Human Review → New Model Version。
 * Modelのstatus（DRAFT/ACTIVE/DEPRECATED）はXT1のまま変更しない（新status追加禁止・section12）。
 * 同時に複数Activeを許さない。
 */

import type { CreatorThinkingModel, CreatorThinkingModelStatus } from "./types";

/** section14: 変更可能な（Soft Skill）ルールフィールドのみをModelChangeCandidateの対象にする */
export const EDITABLE_RULE_FIELDS = [
  "writingRules",
  "contentSelectionRules",
  "creatorFitRules",
  "learningRules",
] as const;
export type CreatorModelEditableRuleField = (typeof EDITABLE_RULE_FIELDS)[number];

export type ModelChangeType = "ruleAdded" | "ruleUpdated" | "ruleDeprecated";
export type ModelChangeCandidateStatus = "PENDING_REVIEW" | "APPROVED" | "REJECTED" | "APPLIED";

/** section13 */
export type ModelChangeCandidate = {
  id: string;
  baseVersion: string;
  proposedVersion: string;
  changeType: ModelChangeType;
  targetRule: CreatorModelEditableRuleField;
  currentValue: string;
  proposedValue: string;
  reason: string;
  sourceSkillIds: string[];
  sourceLearningIds: string[];
  confidence: "low" | "medium" | "high";
  status: ModelChangeCandidateStatus;
  createdAt: string;
  decidedAt?: string;
  approvedBy?: string;
};

/** section16 */
export type CreatorThinkingModelVersionRecord = {
  previousVersion: string | null;
  currentVersion: string;
  activatedAt: string;
  reason: string;
  approvedBy: string;
  rollbackTarget: string | null;
};

export class ProtectedRuleViolationError extends Error {}

/** section14変更禁止一覧のキーワード。targetRule許可リストに加え、reason/proposedValueの自由記述もdefense-in-depthで検査する */
const PROTECTED_KEYWORDS: RegExp[] = [
  /safety/i,
  /fact.?gate/i,
  /hot.?confidence/i,
  /low.?skip/i,
  /duplicate/i,
  /publish.?eligib/i,
  /buffer/i,
  /authority/i,
  /secret/i,
  /\benv\b/i,
  /api.?key/i,
  /human.?only/i,
  /revenue/i,
  /provider.?credential/i,
  /canary/i,
  /\btrade\b/i,
];

/** targetRuleが変更可能リストに無ければ拒否する（allowlist方式。Safety Gate等は最初から選択肢にない） */
export function assertEditableTargetRule(
  targetRule: string
): asserts targetRule is CreatorModelEditableRuleField {
  if (!(EDITABLE_RULE_FIELDS as readonly string[]).includes(targetRule)) {
    throw new ProtectedRuleViolationError(`PROTECTED_OR_UNKNOWN_RULE_FIELD: ${targetRule}`);
  }
}

/** 自由記述（reason/proposedValue）にProtected Boundary関連語が含まれていないかのdefense-in-depth検査 */
export function assertNoProtectedKeyword(text: string): void {
  for (const pattern of PROTECTED_KEYWORDS) {
    if (pattern.test(text)) {
      throw new ProtectedRuleViolationError(`PROTECTED_KEYWORD_DETECTED: ${text}`);
    }
  }
}

function parseVersion(version: string): [number, number, number] {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(version);
  if (!match) throw new Error("INVALID_VERSION_FORMAT");
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

function bumpVersion(version: string, changeType: ModelChangeType): string {
  const [major, minor, patch] = parseVersion(version);
  if (changeType === "ruleUpdated") return `${major}.${minor}.${patch + 1}`;
  return `${major}.${minor + 1}.0`;
}

function makeId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 9)}`;
}

/**
 * section17: Evidence lineageを必須にする（sourceSkillIds/sourceLearningIdsのどちらも空なら作れない）。
 * section14: targetRule/reason/proposedValueがProtected Boundaryに触れていないか検査する。
 */
export function createModelChangeCandidate(input: {
  baseModel: CreatorThinkingModel;
  changeType: ModelChangeType;
  targetRule: CreatorModelEditableRuleField;
  currentValue: string;
  proposedValue: string;
  reason: string;
  sourceSkillIds: string[];
  sourceLearningIds: string[];
  confidence: "low" | "medium" | "high";
  now?: Date;
}): ModelChangeCandidate {
  assertEditableTargetRule(input.targetRule);
  assertNoProtectedKeyword(input.reason);
  assertNoProtectedKeyword(input.proposedValue);
  if (input.sourceSkillIds.length === 0 && input.sourceLearningIds.length === 0) {
    throw new Error("EVIDENCE_LINEAGE_REQUIRED");
  }
  const now = input.now ?? new Date();
  return {
    id: makeId("model_change"),
    baseVersion: input.baseModel.version,
    proposedVersion: bumpVersion(input.baseModel.version, input.changeType),
    changeType: input.changeType,
    targetRule: input.targetRule,
    currentValue: input.currentValue,
    proposedValue: input.proposedValue,
    reason: input.reason,
    sourceSkillIds: input.sourceSkillIds,
    sourceLearningIds: input.sourceLearningIds,
    confidence: input.confidence,
    status: "PENDING_REVIEW",
    createdAt: now.toISOString(),
  };
}

export function decideModelChangeCandidate(
  candidate: ModelChangeCandidate,
  decision: "APPROVED" | "REJECTED",
  approvedBy: string,
  now = new Date()
): ModelChangeCandidate {
  if (candidate.status !== "PENDING_REVIEW") throw new Error("MODEL_CHANGE_ALREADY_DECIDED");
  if (!approvedBy?.trim()) throw new Error("APPROVER_REQUIRED");
  const decidedAt = now.toISOString();
  return { ...candidate, status: decision, decidedAt, approvedBy: approvedBy.trim() };
}

/**
 * section13: APPROVEDなModelChangeCandidateだけが新しいModel Versionを作れる。
 * 生成される新Versionは必ずDRAFT（AIやこの関数自身がACTIVEへ昇格させることはない。昇格はactivateModelVersionのみ）。
 */
export function applyModelChangeCandidate(
  base: CreatorThinkingModel,
  change: ModelChangeCandidate,
  now = new Date()
): CreatorThinkingModel {
  if (change.status !== "APPROVED") throw new Error("MODEL_CHANGE_NOT_APPROVED");
  if (change.baseVersion !== base.version) throw new Error("BASE_VERSION_MISMATCH");
  assertEditableTargetRule(change.targetRule);

  const rules = [...base[change.targetRule]];
  let nextRules: string[];
  if (change.changeType === "ruleAdded") {
    nextRules = [...rules, change.proposedValue];
  } else if (change.changeType === "ruleUpdated") {
    const index = rules.indexOf(change.currentValue);
    if (index === -1) throw new Error("CURRENT_VALUE_NOT_FOUND");
    nextRules = rules.map((rule, i) => (i === index ? change.proposedValue : rule));
  } else {
    nextRules = rules.filter((rule) => rule !== change.currentValue);
  }

  const updatedAt = now.toISOString();
  return {
    ...base,
    [change.targetRule]: nextRules,
    version: change.proposedVersion,
    status: "DRAFT",
    sourceFeedbackIds: [
      ...new Set([...base.sourceFeedbackIds, ...change.sourceLearningIds, ...change.sourceSkillIds]),
    ],
    updatedAt,
  };
}

/** 同時に複数ACTIVEを許さない（section12）。既存ACTIVEは自動でDEPRECATEDへ移す */
export function assertSingleActiveVersion(versions: CreatorThinkingModel[]): void {
  const activeCount = versions.filter((model) => model.status === "ACTIVE").length;
  if (activeCount > 1) throw new Error("MULTIPLE_ACTIVE_MODEL_VERSIONS");
}

/**
 * DRAFT版をHuman Reviewの承認（approvedBy必須）を経てACTIVEへ昇格する。
 * 旧ACTIVEは自動でDEPRECATEDになる。rollback用のhistoryレコードを返す。
 */
export function activateModelVersion(
  versions: CreatorThinkingModel[],
  targetVersion: string,
  approvedBy: string,
  reason: string,
  now = new Date()
): { versions: CreatorThinkingModel[]; history: CreatorThinkingModelVersionRecord } {
  if (!approvedBy?.trim()) throw new Error("APPROVER_REQUIRED");
  const target = versions.find((model) => model.version === targetVersion);
  if (!target) throw new Error("VERSION_NOT_FOUND");
  if (target.status !== "DRAFT") throw new Error("ONLY_DRAFT_CAN_BE_ACTIVATED");

  const previouslyActive = versions.find((model) => model.status === "ACTIVE") ?? null;
  const activatedAt = now.toISOString();
  const nextVersions = versions.map((model) => {
    if (model.version === targetVersion) {
      const next: CreatorThinkingModel = {
        ...model,
        status: "ACTIVE" as CreatorThinkingModelStatus,
        approvedBy: approvedBy.trim(),
        updatedAt: activatedAt,
      };
      return next;
    }
    if (model.status === "ACTIVE") {
      return { ...model, status: "DEPRECATED" as CreatorThinkingModelStatus, updatedAt: activatedAt };
    }
    return model;
  });

  assertSingleActiveVersion(nextVersions);

  return {
    versions: nextVersions,
    history: {
      previousVersion: previouslyActive?.version ?? null,
      currentVersion: targetVersion,
      activatedAt,
      reason,
      approvedBy: approvedBy.trim(),
      rollbackTarget: previouslyActive?.version ?? null,
    },
  };
}

/**
 * section16: Rollbackはhistoryに基づく。直前のhistoryレコードのrollbackTargetを再Activateするだけで、
 * Production実行は伴わない（Contract/historyまで）。
 */
export function rollbackModelVersion(
  versions: CreatorThinkingModel[],
  history: CreatorThinkingModelVersionRecord[],
  approvedBy: string,
  reason: string,
  now = new Date()
): { versions: CreatorThinkingModel[]; history: CreatorThinkingModelVersionRecord } {
  const last = history.at(-1);
  if (!last?.rollbackTarget) throw new Error("NO_ROLLBACK_TARGET");
  const target = versions.find((model) => model.version === last.rollbackTarget);
  if (!target) throw new Error("ROLLBACK_TARGET_NOT_FOUND");

  const reDrafted = versions.map((model) =>
    model.version === target.version ? { ...model, status: "DRAFT" as CreatorThinkingModelStatus } : model
  );
  return activateModelVersion(reDrafted, target.version, approvedBy, reason, now);
}
