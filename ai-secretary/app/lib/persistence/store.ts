/**
 * Persistence 抽象（ADR-E, docs/14）。
 *
 *        Domain / Application
 *                ↓
 *      Store / Repository Interface   ← ここ
 *                ↓
 *  File/Vault | Redis | Supabase（実装は差し替え可能）
 *
 * Application / Domain は Supabase SDK 等を直接呼ばず、この interface に依存する。
 * Phase 1 の既定実装は Vault(Markdown)。将来 Supabase 実装をドロップインできる。
 */

export interface StoreEntry {
  name: string;
  type: "file" | "dir";
}

export interface StoreFile {
  content: string;
  /** 楽観ロック用（Vault=GitHub sha 等）。実装依存。 */
  version?: string;
}

/**
 * Markdown 本文（Knowledge SSOT）を読み書きする最小インターフェース。
 * 破壊的操作（delete/move/rename）は意図的に定義しない（Vault安全性・ADR-F）。
 */
export interface DocumentStore {
  getFile(path: string): Promise<StoreFile>;
  /** version を渡すと楽観的更新。新規作成時は省略。 */
  saveFile(path: string, content: string, version?: string): Promise<{ version: string }>;
  listEntries(dirPath: string): Promise<StoreEntry[]>;
  listFiles(dirPath: string): Promise<string[]>;
}

/**
 * 構造化 Machine State / 検索Index 用の将来インターフェース（Phase 2+ / Supabase導入時に実装）。
 * ここでは「差し替え口がある」ことを型として明示するだけに留める。
 */
export interface KeyValueStore {
  get<T = unknown>(key: string): Promise<T | null>;
  set<T = unknown>(key: string, value: T, ttlSeconds?: number): Promise<void>;
}
