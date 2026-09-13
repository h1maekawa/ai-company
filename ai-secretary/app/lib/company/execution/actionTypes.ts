/**
 * Action の種別とリスク — Phase 6 §15 〜 §21
 *
 * Phase 6 の中心。Agentは外部Actionを直接実行できず、
 * 必ず ActionRequest として Gateway を通す。
 *
 * リスク区分は Phase 2 の RiskLevel を使う（複製しない）。
 *   R0 … 自動実行可
 *   R1 … Policyが許せば自動
 *   R2 … 原則CEO確認。Draftまで自動、実送信はしない
 *   R3 … 必ずCEO承認
 *   R4 … AI実行禁止。承認があっても実行しない
 */

import type { RiskLevel } from "../agentTypes";

export type ActionType =
  /* ─── 内部（Phase 6 で実際に実行できるもの） ─── */
  | "MISSION_STATUS_UPDATE"
  | "INTERNAL_MEMORY_WRITE"
  | "INTERNAL_REPORT_CREATE"
  | "ANALYSIS"
  | "DRAFT_GENERATE"
  /* ─── 外部（Phase 6 では DRY_RUN / 未実装） ─── */
  | "EMAIL_DRAFT"
  | "GMAIL_SEND"
  | "PUBLISH_DRAFT"
  | "PUBLISH"
  | "CALENDAR_WRITE"
  | "GITHUB_WRITE"
  | "PAYMENT"
  | "AD_SPEND"
  /* ─── 禁止（R4） ─── */
  | "INVESTMENT_TRADE"
  | "CREDENTIAL_CHANGE"
  | "PROTECTED_CORE_MUTATION"
  | "BULK_DELETE";

/**
 * Action → リスク区分。
 *
 * ここが Gateway の判断の起点になるため、
 * 新しい Action を足したら必ずここへ登録する。
 * 未登録の Action は最も危険な R4 として扱う（Default Deny・§22）。
 */
export const ACTION_RISK: Record<ActionType, RiskLevel> = {
  // R0: 内部で完結し、何も変更しない
  ANALYSIS: "R0",
  DRAFT_GENERATE: "R0",

  // R1: 内部の状態を変えるが、外部影響はない
  MISSION_STATUS_UPDATE: "R1",
  INTERNAL_MEMORY_WRITE: "R1",
  INTERNAL_REPORT_CREATE: "R1",

  // R2: 外へ出る一歩手前。下書きまでは作るが送らない
  EMAIL_DRAFT: "R2",
  PUBLISH_DRAFT: "R2",
  CALENDAR_WRITE: "R2",

  // R3: 外部に影響が出る。必ずCEO承認
  GMAIL_SEND: "R3",
  PUBLISH: "R3",
  GITHUB_WRITE: "R3",
  PAYMENT: "R3",
  AD_SPEND: "R3",

  // R4: AIに実行させない
  INVESTMENT_TRADE: "R4",
  CREDENTIAL_CHANGE: "R4",
  PROTECTED_CORE_MUTATION: "R4",
  BULK_DELETE: "R4",
};

export const ACTION_LABELS: Record<ActionType, string> = {
  ANALYSIS: "分析",
  DRAFT_GENERATE: "下書き生成",
  MISSION_STATUS_UPDATE: "ミッション状態の更新",
  INTERNAL_MEMORY_WRITE: "内部メモの保存",
  INTERNAL_REPORT_CREATE: "内部レポートの作成",
  EMAIL_DRAFT: "メール下書き",
  PUBLISH_DRAFT: "公開用下書き",
  CALENDAR_WRITE: "カレンダー変更",
  GMAIL_SEND: "メール送信",
  PUBLISH: "公開",
  GITHUB_WRITE: "GitHubへの書き込み",
  PAYMENT: "支払い",
  AD_SPEND: "広告出稿",
  INVESTMENT_TRADE: "証券取引",
  CREDENTIAL_CHANGE: "認証情報の変更",
  PROTECTED_CORE_MUTATION: "Protected Coreの変更",
  BULK_DELETE: "一括削除",
};

/** 権限は "group.action" 形式（Phase 2 の grantedPermissions と同じ表記） */
export type Permission = string;

/**
 * Action → 必要な権限。
 * Phase 2 の EmployeeAgent.permissions と突き合わせる。
 * 空配列は「特別な権限を要さない」という意味で、権限チェックを素通りさせる。
 */
export const ACTION_PERMISSIONS: Record<ActionType, Permission[]> = {
  ANALYSIS: [],
  DRAFT_GENERATE: [],
  MISSION_STATUS_UPDATE: ["vault.write"],
  INTERNAL_MEMORY_WRITE: ["vault.write"],
  INTERNAL_REPORT_CREATE: ["vault.write"],
  EMAIL_DRAFT: [],
  PUBLISH_DRAFT: ["publish.draft"],
  CALENDAR_WRITE: ["calendar.write"],
  GMAIL_SEND: ["gmail.send"],
  PUBLISH: ["publish.publish"],
  GITHUB_WRITE: ["github.write"],
  PAYMENT: ["payment.execute"],
  AD_SPEND: ["payment.execute"],
  INVESTMENT_TRADE: ["investment.trade"],
  CREDENTIAL_CHANGE: ["credential.write"],
  PROTECTED_CORE_MUTATION: ["core.write"],
  BULK_DELETE: ["vault.write"],
};

/** 未登録のActionは最も危険なものとして扱う（Default Deny） */
export function riskOf(actionType: string): RiskLevel {
  return ACTION_RISK[actionType as ActionType] ?? "R4";
}

export function permissionsFor(actionType: string): Permission[] {
  return ACTION_PERMISSIONS[actionType as ActionType] ?? ["__unknown__"];
}

export function isKnownAction(actionType: string): actionType is ActionType {
  return actionType in ACTION_RISK;
}
