/**
 * Knowledge / Capture のステータスと frontmatter 型（ADR-C, ADR-F, docs/14）。
 */

import type { CanonicalDomain } from "./domain";

/**
 * Capture → Inbox → 昇格 のライフサイクル状態。
 * captured   … Inboxに取り込んだ直後（未整理）
 * candidate  … AI整理済み・昇格提案あり（未承認）
 * promoted   … 人間承認済み・正式Knowledge化
 * merged     … 既存Knowledgeへ統合済み
 * rejected   … 破棄
 * archived   … 保留/アーカイブ
 */
export const KNOWLEDGE_STATUSES = [
  "captured",
  "candidate",
  "promoted",
  "merged",
  "rejected",
  "archived",
] as const;

export type KnowledgeStatus = (typeof KNOWLEDGE_STATUSES)[number];

export function isKnowledgeStatus(value: string): value is KnowledgeStatus {
  return (KNOWLEDGE_STATUSES as readonly string[]).includes(value);
}

/** 所有者。Human Managed の既存ノートを AI が自動編集しないための機械判定に使う（ADR-F）。 */
export type ManagedBy = "ai" | "human";

/**
 * Knowledge ファイルの frontmatter（正本は Obsidian Markdown）。
 * 既存 saveKnowledge 互換のため type: "knowledge" 等は維持しつつ、
 * domain / status / managed_by を追加する。
 */
export interface KnowledgeFrontmatter {
  id: string;
  type: "knowledge";
  /** Canonical Domain（論理分類） */
  domain: CanonicalDomain;
  /** 後方互換: 旧 category（Legacy Category をそのまま残す。読み込み側で alias 解決） */
  category?: string;
  status: KnowledgeStatus;
  /** AI管理か人間管理か。省略/不明は human 扱い（ADR-F 既定）。 */
  managed_by: ManagedBy;
  importance: 1 | 2 | 3;
  created: string;
  updated: string;
  reviewed_at?: string | null;
  tags: string[];
  source_ref: string[];
  related: string[];
}
