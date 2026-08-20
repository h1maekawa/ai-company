/**
 * Knowledge / Capture のステータス・所有権・frontmatter 型（ADR-C/F, docs/14, Phase4修正）。
 */

import type { CanonicalDomain } from "./domain";

/**
 * Capture → Inbox → 昇格 のライフサイクル状態。
 * captured   … Inboxに取り込んだ直後（未整理・AI Managed）
 * candidate  … AI整理済み・昇格提案あり（未承認・AI Managed）
 * promoted   … 人間承認済み・正式Knowledge化（Human Managed）
 * merged     … 既存Knowledgeへ統合済み（Human Managed）
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
 * Phase4修正1: status から managed_by を決定する唯一の関数。
 * captured / candidate → ai（AI作業中データ）
 * promoted / merged    → human（Human Approval済みの正式Knowledge。以降AI自動編集禁止）
 * rejected / archived  → ai（作業中データの終端）
 */
export function managedByForStatus(status: KnowledgeStatus): ManagedBy {
  return status === "promoted" || status === "merged" ? "human" : "ai";
}

/**
 * 正式Knowledge（promoted/merged）ファイルの frontmatter。正本は Obsidian Markdown。
 */
export interface KnowledgeFrontmatter {
  id: string;
  type: "knowledge";
  domain: CanonicalDomain;
  category?: string; // 後方互換: 旧 category を残す（読み込み側で alias 解決）
  status: KnowledgeStatus;
  managed_by: ManagedBy;
  importance: 1 | 2 | 3;
  created: string;
  updated: string;
  reviewed_at?: string | null;
  tags: string[];
  source_ref: string[];
  related: string[];
}

/* ─── Capture / Candidate（Inbox・AI Managed 作業データ） ─────────────── */

export const CAPTURE_SOURCES = [
  "conversation",
  "grilling",
  "research",
  "skill",
  "workflow",
  "manual",
] as const;
export type CaptureSource = (typeof CAPTURE_SOURCES)[number];

export function isCaptureSource(v: string): v is CaptureSource {
  return (CAPTURE_SOURCES as readonly string[]).includes(v);
}

export type RecommendedAction = "promote" | "merge" | "hold" | "reject";

/** AI整理（organize）の出力。 */
export interface AiOrganizeResult {
  summary: string;
  title: string;
  /** canonical domain 候補（解決不能なら空 → domain_resolution_required=true） */
  domainCandidates: CanonicalDomain[];
  tags: string[];
  /** 重複候補（既存Knowledgeの path） */
  duplicateCandidates: string[];
  /** 矛盾候補（既存Knowledgeの path） */
  conflictCandidates: string[];
  recommendedAction: RecommendedAction;
  /** 昇格先候補（merge 時に統合する既存Knowledgeの path） */
  promotionTargets: string[];
}

/**
 * Inbox の Capture/Candidate アイテム frontmatter。
 * これは AI Managed（memory/personal/inbox/ 配下）。正式Knowledgeとは別ファイル（Phase4修正4・案B）。
 */
export interface CaptureFrontmatter {
  id: string;
  type: "capture";
  status: KnowledgeStatus;
  managed_by: ManagedBy;
  source: CaptureSource;
  created: string;
  updated: string;
  // ─ AI整理後（candidate）に付与 ─
  title?: string;
  domain_candidates?: CanonicalDomain[];
  /** canonical domain が未確定なら true。true の間は Promotion 不可。 */
  domain_resolution_required?: boolean;
  tags?: string[];
  duplicate_candidates?: string[];
  conflict_candidates?: string[];
  recommended_action?: RecommendedAction;
  promotion_targets?: string[];
  // ─ 昇格/統合後のリンク ─
  promoted_to?: string; // 生成された正式Knowledgeの path（promote）／統合先 path（merge）
}
