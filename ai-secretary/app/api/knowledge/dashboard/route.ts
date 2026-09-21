import { NextRequest, NextResponse } from "next/server";
import { vaultKnowledgeSearch } from "@/app/lib/knowledge/search";
import { vaultDocumentStore } from "@/app/lib/persistence/vaultStore";
import { supabaseKnowledgeIndexRepository } from "@/app/lib/persistence/supabase/knowledgeIndexRepository";
import { listCandidates } from "@/app/lib/knowledge/lifecycle";
import { parseFrontmatter } from "@/app/lib/knowledge/frontmatter";
import { readVaultKnowledgeIndexRecords, resyncKnowledgeIndex } from "@/app/lib/knowledge/indexSync";
import { isHumanReviewPending } from "@/app/lib/knowledge/types";
import { loadExecutionState } from "@/app/lib/company/execution/store";
import { deriveKnowledgeUsage, summarizeKnowledgeUsage } from "@/app/lib/company/evolution/skillCandidates";

export const dynamic = "force-dynamic";
const safeKnowledgePath = (path: string) => path.startsWith("memory/knowledge/") && path.endsWith(".md") && !path.includes("..");

export async function GET(req: NextRequest) {
  try {
    const execution = await loadExecutionState().catch(() => null);
    const usageEvents = execution ? deriveKnowledgeUsage(execution) : null;
    const usageFor = (id: string, path: string) => usageEvents === null
      ? summarizeKnowledgeUsage(null, id)
      : summarizeKnowledgeUsage(usageEvents.map((event) => event.knowledgeId === path ? { ...event, knowledgeId: id } : event), id);
    const sp = req.nextUrl.searchParams;
    const detailPath = sp.get("path") ?? "";
    if (detailPath) {
      if (!safeKnowledgePath(detailPath)) return NextResponse.json({ error: "Knowledge pathが不正です" }, { status: 400 });
      const file = await vaultDocumentStore.getFile(detailPath);
      const parsed = parseFrontmatter(file.content);
      const knowledgeId = String(parsed.data.id ?? detailPath);
      const usage = usageFor(knowledgeId, detailPath);
      const relatedSkillCandidates = execution?.skillCandidates.filter((candidate) => candidate.sourceKnowledgeIds.includes(knowledgeId) || candidate.sourceKnowledgeIds.includes(detailPath)).map((candidate) => ({ id: candidate.id, name: candidate.name, status: candidate.status })) ?? [];
      return NextResponse.json({ path: detailPath, frontmatter: parsed.data, body: parsed.body, usage, relatedSkillCandidates });
    }
    const query = { text: sp.get("q") || undefined, domain: sp.get("domain") || undefined, tags: (sp.get("tags") || "").split(",").filter(Boolean), managedBy: sp.get("managedBy") || undefined, updatedAfter: sp.get("updatedAfter") || undefined, limit: 75 };
    let source: "supabase" | "vault" = "supabase";
    let warning: string | undefined;
    let hits;
    try {
      if (!supabaseKnowledgeIndexRepository.configured()) throw new Error("not configured");
      hits = await supabaseKnowledgeIndexRepository.search(query);
    } catch {
      source = "vault"; warning = "高速Indexが利用できないためVault検索を使用中";
      hits = await vaultKnowledgeSearch.search({ text: query.text, domains: query.domain ? [query.domain] : undefined, tags: query.tags.length ? query.tags : undefined, limit: 75 });
    }
    const candidates = await listCandidates();
    const weekAgo = new Date(Date.now() - 7 * 86_400_000).toISOString();
    let total: number | null = null;
    let addedThisWeek: number | null = null;
    try {
      if (!supabaseKnowledgeIndexRepository.configured()) throw new Error("not configured");
      [total, addedThisWeek] = await Promise.all([
        supabaseKnowledgeIndexRepository.count(),
        supabaseKnowledgeIndexRepository.countUpdatedSince(weekAgo),
      ]);
      if (total == null || addedThisWeek == null) throw new Error("count unavailable");
    } catch {
      try {
        const allKnowledge = await readVaultKnowledgeIndexRecords();
        total = allKnowledge.length;
        addedThisWeek = allKnowledge.filter((record) => record.updated_at && new Date(record.updated_at).getTime() >= new Date(weekAgo).getTime()).length;
      } catch {
        total = null;
        addedThisWeek = null;
      }
    }
    return NextResponse.json({ source, warning, hits: hits.map((hit) => ({ ...hit, usage: usageFor("id" in hit ? hit.id : hit.knowledge_id, hit.path) })), candidates, kpis: { knowledge: total, candidate: candidates.length, review: candidates.filter((item) => isHumanReviewPending(item.frontmatter.status)).length, addedThisWeek } });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Knowledgeを取得できません" }, { status: 500 }); }
}

export async function POST() {
  try { return NextResponse.json({ ok: true, ...(await resyncKnowledgeIndex()) }); }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "同期できません" }, { status: 503 }); }
}
