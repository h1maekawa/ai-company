import { vaultDocumentStore } from "../persistence/vaultStore";
import { supabaseKnowledgeIndexRepository, type KnowledgeIndexRecord } from "../persistence/supabase/knowledgeIndexRepository";
import { syncStatusRepository } from "../persistence/supabase/syncStatusRepository";
import { knowledgeIndexRecord } from "./indexRecord";
import { listMarkdownPathsRecursively } from "./walk";

export async function readVaultKnowledgeIndexRecords(): Promise<KnowledgeIndexRecord[]> {
  const paths = await listMarkdownPathsRecursively(vaultDocumentStore, "memory/knowledge");
  const records: KnowledgeIndexRecord[] = [];
  for (const path of paths) {
    records.push(knowledgeIndexRecord(path, (await vaultDocumentStore.getFile(path)).content));
  }
  return records;
}
export async function indexKnowledgePathBestEffort(path: string): Promise<boolean> {
  if (!supabaseKnowledgeIndexRepository.configured()) return false;
  try { const file = await vaultDocumentStore.getFile(path); await supabaseKnowledgeIndexRepository.upsert([knowledgeIndexRecord(path, file.content)]); return true; } catch (error) { console.warn("[knowledge-index] upsert failed", error); return false; }
}
export async function resyncKnowledgeIndex(): Promise<{ indexed: number; unavailable: boolean }> {
  if (!supabaseKnowledgeIndexRepository.configured()) return { indexed: 0, unavailable: true };
  const records = await readVaultKnowledgeIndexRecords();
  await supabaseKnowledgeIndexRepository.upsert(records);
  await syncStatusRepository.upsert({ service: "knowledge_index", status: "connected", last_checked_at: new Date().toISOString(), last_success_at: new Date().toISOString(), last_sync_at: new Date().toISOString(), item_count: records.length, message: "Knowledge Indexを同期しました" });
  return { indexed: records.length, unavailable: false };
}
