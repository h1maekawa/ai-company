import { asArray, asString, parseFrontmatter } from "./frontmatter";

export type KnowledgeIndexDocument = {
  knowledge_id: string; path: string; title: string; domain: string | null; tags: string[];
  summary: string; managed_by: string; source: string | null; created_at: string | null;
  updated_at: string | null; indexed_at: string;
};
function titleFrom(body: string, fallback: string) { return body.match(/^#\s+(.+)$/m)?.[1]?.trim() || fallback.replace(/\.md$/, ""); }
function summaryFrom(body: string) { return body.replace(/^#{1,6}\s+.*$/gm, "").replace(/\s+/g, " ").trim().slice(0, 240); }
export function knowledgeIndexRecord(path: string, content: string): KnowledgeIndexDocument {
  const parsed = parseFrontmatter(content); const data = parsed.data; const filename = path.split("/").pop() ?? path;
  return { knowledge_id: asString(data.id) || path, path, title: titleFrom(parsed.body, filename), domain: asString(data.domain) || asString(data.category) || null, tags: asArray(data.tags), summary: summaryFrom(parsed.body), managed_by: asString(data.managed_by) || "human", source: asString(data.source) || asString(data.source_ref) || null, created_at: asString(data.created) || null, updated_at: asString(data.updated) || null, indexed_at: new Date().toISOString() };
}
