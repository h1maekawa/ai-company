/**
 * DocumentStore の既定実装 = 既存 Vault 抽象（GitHub Contents API / ローカルfs）を包む。
 * 既存 `lib/vault.ts` を唯一の入出力経路として再利用し、挙動を変えない（ADR-A/E）。
 */

import {
  getVaultFile,
  saveVaultFile,
  listVaultEntries,
  listVaultDirectory,
} from "../vault";
import type { DocumentStore, StoreEntry, StoreFile } from "./store";

export const vaultDocumentStore: DocumentStore = {
  async getFile(path: string): Promise<StoreFile> {
    const { content, sha } = await getVaultFile(path);
    return { content, version: sha };
  },

  async saveFile(path: string, content: string, version?: string): Promise<{ version: string }> {
    const { sha } = await saveVaultFile(path, content, version);
    return { version: sha };
  },

  async listEntries(dirPath: string): Promise<StoreEntry[]> {
    const entries = await listVaultEntries(dirPath);
    return entries.map((e) => ({ name: e.name, type: e.type }));
  },

  async listFiles(dirPath: string): Promise<string[]> {
    return listVaultDirectory(dirPath);
  },
};
