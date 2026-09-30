import { createHash } from "node:crypto";
import { vaultDocumentStore } from "../persistence/vaultStore";
import { supabaseKnowledgeIndexRepository, type KnowledgeIndexRecord } from "../persistence/supabase/knowledgeIndexRepository";
import { syncStatusRepository, type SystemSyncStatus } from "../persistence/supabase/syncStatusRepository";
import { knowledgeIndexRecord } from "./indexRecord";
import { listMarkdownPathsRecursively } from "./walk";

const PREFIX = "knowledge_index:";
const safePath = (path: string) => path.startsWith("memory/knowledge/") && path.endsWith(".md") && !path.includes("..");
const serviceFor = (path: string) => `${PREFIX}${path}`;
const sourceVersion = (content: string) => createHash("sha256").update(content).digest("hex");

export async function readVaultKnowledgeIndexRecords(): Promise<KnowledgeIndexRecord[]> {
  const paths = await listMarkdownPathsRecursively(vaultDocumentStore, "memory/knowledge");
  const records: KnowledgeIndexRecord[] = [];
  for (const path of paths) records.push(knowledgeIndexRecord(path, (await vaultDocumentStore.getFile(path)).content));
  return records;
}

/** Source writes happen before this call. A failed index write leaves the source untouched and retryable. */
export async function indexKnowledgePathBestEffort(path: string): Promise<boolean> {
  if (!safePath(path) || !supabaseKnowledgeIndexRepository.configured()) return false;
  let content: string;
  try {
    content = (await vaultDocumentStore.getFile(path)).content;
  } catch (error) {
    console.warn("[knowledge-index] source read failed", error);
    return false;
  }
  const version = sourceVersion(content);
  const service = serviceFor(path);
  const at = new Date().toISOString();
  const base: SystemSyncStatus = {
    service, status: "warning", last_checked_at: at,
    message: "Index pending", metadata: { path, sourceSaved: true, sourceVersion: version, indexVersion: null, phase: "pending" },
  };
  try {
    const previous = await syncStatusRepository.knowledgePath(service);
    if (previous?.metadata?.indexVersion === version && previous.status === "connected") return true;
    await syncStatusRepository.upsert(base);
    await supabaseKnowledgeIndexRepository.upsert([knowledgeIndexRecord(path, content)]);
    await syncStatusRepository.upsert({
      ...base, status: "connected", last_success_at: at, last_sync_at: at,
      message: "Index synced", last_error: null,
      metadata: { path, sourceSaved: true, sourceVersion: version, indexVersion: version, phase: "synced" },
    });
    return true;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Index update failed";
    await syncStatusRepository.upsert({ ...base, message: "Index failed; source retained", last_error: message,
      metadata: { ...base.metadata, phase: "failed" } }).catch((statusError) => console.warn("[knowledge-index] status write failed", statusError));
    console.warn("[knowledge-index] upsert failed", error);
    return false;
  }
}

/** Only known changed paths are retried. No Vault walk is triggered by a routine retry. */
export async function retryPendingKnowledgeIndex(limit = 10): Promise<{ retried: number; indexed: number; unavailable: boolean }> {
  if (!supabaseKnowledgeIndexRepository.configured()) return { retried: 0, indexed: 0, unavailable: true };
  const pending = await syncStatusRepository.knowledgePending(limit);
  let indexed = 0;
  for (const row of pending) {
    const path = row.metadata?.path;
    if (typeof path === "string" && safePath(path) && await indexKnowledgePathBestEffort(path)) indexed++;
  }
  return { retried: pending.length, indexed, unavailable: false };
}

/** Explicit reconciliation only; it never deletes index rows for missing or moved source paths. */
export async function resyncKnowledgeIndex(): Promise<{ indexed: number; unavailable: boolean }> {
  if (!supabaseKnowledgeIndexRepository.configured()) return { indexed: 0, unavailable: true };
  const paths = await listMarkdownPathsRecursively(vaultDocumentStore, "memory/knowledge");
  let indexed = 0;
  for (const path of paths) if (await indexKnowledgePathBestEffort(path)) indexed++;
  await syncStatusRepository.upsert({ service: "knowledge_index", status: indexed === paths.length ? "connected" : "warning", last_checked_at: new Date().toISOString(), last_sync_at: new Date().toISOString(), item_count: indexed, message: `Knowledge Index reconciliation: ${indexed}/${paths.length}; missing paths were not deleted` });
  return { indexed, unavailable: false };
}
