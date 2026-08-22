import { getSupabaseConfig, supabaseRequest } from "./client";

export type KnowledgeIndexRecord = {
  knowledge_id: string; path: string; title: string; domain: string | null; tags: string[];
  summary: string; managed_by: string; source: string | null; created_at: string | null;
  updated_at: string | null; indexed_at: string;
};
export type IndexSearch = { text?: string; domain?: string; tags?: string[]; managedBy?: string; updatedAfter?: string; limit?: number };
export interface KnowledgeIndexRepository {
  configured(): boolean;
  search(query: IndexSearch): Promise<KnowledgeIndexRecord[]>;
  upsert(records: KnowledgeIndexRecord[]): Promise<void>;
  count(): Promise<number | null>;
  countUpdatedSince(date: string): Promise<number | null>;
}

const sanitize = (value: string) => value.replace(/[,%()]/g, " ").trim();
async function countRows(filter = ""): Promise<number | null> {
  const config = getSupabaseConfig();
  if (!config) return null;
  const response = await fetch(`${config.url}/rest/v1/knowledge_index?select=knowledge_id${filter}`, { method: "HEAD", cache: "no-store", headers: { apikey: config.serviceRoleKey, Authorization: `Bearer ${config.serviceRoleKey}`, Prefer: "count=exact" } });
  if (!response.ok) throw new Error(`Supabase count failed (${response.status})`);
  const total = response.headers.get("content-range")?.split("/")[1];
  return total && total !== "*" ? Number(total) : null;
}
export const supabaseKnowledgeIndexRepository: KnowledgeIndexRepository = {
  configured: () => Boolean(getSupabaseConfig()),
  async search(query) {
    const params = new URLSearchParams({ select: "*", order: "updated_at.desc", limit: String(Math.min(query.limit ?? 50, 100)) });
    if (query.domain) params.set("domain", `eq.${sanitize(query.domain)}`);
    if (query.managedBy) params.set("managed_by", `eq.${sanitize(query.managedBy)}`);
    if (query.updatedAfter) params.set("updated_at", `gte.${query.updatedAfter}`);
    if (query.tags?.length) params.set("tags", `ov.{${query.tags.map(sanitize).join(",")}}`);
    if (query.text?.trim()) {
      const text = sanitize(query.text);
      params.set("or", `(title.ilike.*${text}*,summary.ilike.*${text}*,domain.ilike.*${text}*)`);
    }
    return supabaseRequest<KnowledgeIndexRecord[]>(`knowledge_index?${params}`);
  },
  async upsert(records) {
    if (!records.length) return;
    await supabaseRequest("knowledge_index?on_conflict=path", { method: "POST", headers: { Prefer: "resolution=merge-duplicates,return=minimal" }, body: JSON.stringify(records) });
  },
  async count() {
    return countRows();
  },
  async countUpdatedSince(date) {
    return countRows(`&updated_at=gte.${encodeURIComponent(date)}`);
  },
};
