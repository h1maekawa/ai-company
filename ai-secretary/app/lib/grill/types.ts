/**
 * Grilling Session — 型定義（docs/15 D2）。
 *
 * Grilling は「曖昧なアイデア・計画・設計」を論点分解し、Frontier方式で質問を積み上げ、
 * Shared Understanding → User Confirmation まで進める複数ターンの対話型セッション。
 *
 * 重要な境界:
 * - Session State は Machine State（Knowledgeではない）。永続実体は Redis（D3）。
 * - 正式Knowledge化は confirmed 後に Phase4 Capture Flow へ渡す1本のみ（D9/D10）。
 */

/** ノードの状態。dependsOn が全て answered になったものが frontier（D7・コードで決定論的に計算）。 */
export type GrillNodeStatus = "blocked" | "frontier" | "answered";

/** セッションの状態。AIの判断で途中終了しない（D8）。 */
export type GrillSessionStatus =
  | "active"
  | "ready_for_confirmation"
  | "confirmed"
  | "cancelled";

/** 「選ぶだけ」で答えられる選択肢。index=1 が推奨案。 */
export interface GrillOption {
  index: number;
  label: string;
  description: string;
  isRecommended: boolean;
}

export interface GrillNode {
  id: string;
  /** 短い論点名（Q1 - <title> の <title>） */
  title: string;
  /** 質問本文 */
  question: string;
  /** 前提ノードID。全て answered で frontier 化する。 */
  dependsOn: string[];
  status: GrillNodeStatus;
  /** 選択肢（無い場合は自由記述） */
  options?: GrillOption[];
  /** AIの推奨回答（必須・D3要件「各質問には必ず推奨を付ける」） */
  recommendation: string;
  recommendationReason: string;
  answer?: string;
  answeredAt?: string;
  /** 派生ノードID */
  children: string[];
}

/** AIが自分で調べた事実（ユーザーに質問しないためのもの・D4） */
export interface GrillFact {
  id: string;
  statement: string;
  /** 例: "knowledge:memory/knowledge/sales/xxx.md" / "vault:memory/..." / "repo:app/lib/..." */
  source: string;
  provider: FactProviderId;
}

export type FactProviderId = "knowledge" | "vault" | "repo";

export interface SharedUnderstanding {
  summary: string;
  majorDecisions: { decision: string; reason: string }[];
  rejectedAlternatives: { alternative: string; reason: string }[];
  risks: string[];
  remainingAssumptions: string[];
  implementationScope: string[];
  generatedAt: string;
}

/**
 * 保存結果（D3）。本番では Redis のみが永続実体。
 * Redis へ書けなかった場合は durability: "volatile"（再開保証なし）を返し、UIで明示する。
 */
export interface PersistResult {
  durability: "durable" | "volatile";
  backend: "redis" | "file" | "tmp" | "none";
  warning?: string;
}

export interface GrillSession {
  id: string;
  topic: string;
  status: GrillSessionStatus;
  designTree: GrillNode[];
  /** nodeId → answer */
  answers: Record<string, string>;
  currentFrontier: string[];
  round: number;
  facts: GrillFact[];
  sharedUnderstanding?: SharedUnderstanding;
  secretaryId: string;
  /** 直近の保存が永続実体に届いたか（D3） */
  durability: "durable" | "volatile";
  createdAt: string;
  updatedAt: string;
}

/** セッション一覧（再開UI用）の軽量表現 */
export interface GrillSessionSummary {
  id: string;
  topic: string;
  status: GrillSessionStatus;
  round: number;
  answeredCount: number;
  totalCount: number;
  updatedAt: string;
}

export const VOLATILE_WARNING =
  "このセッションは再開保証されません（永続ストアへ保存できませんでした）。";
