import { NextRequest, NextResponse } from "next/server";
import { vaultKnowledgeSearch } from "@/app/lib/knowledge/search";
import { vaultDocumentStore } from "@/app/lib/persistence/vaultStore";
import { supabaseKnowledgeIndexRepository } from "@/app/lib/persistence/supabase/knowledgeIndexRepository";
import { listCandidates } from "@/app/lib/knowledge/lifecycle";
import { parseFrontmatter } from "@/app/lib/knowledge/frontmatter";
import { resyncKnowledgeIndex } from "@/app/lib/knowledge/indexSync";

export const dynamic = "force-dynamic";
const safeKnowledgePath = (path: string) => path.startsWith("memory/knowledge/") && path.endsWith(".md") && !path.includes("..");

export async function GET(req: NextRequest) {
  try {
    const sp = req.nextUrl.searchParams;
    const detailPath = sp.get("path") ?? "";
    if (detailPath) {
      if (!safeKnowledgePath(detailPath)) return NextResponse.json({ error: "Knowledge pathが不正です" }, { status: 400 });
      const file = await vaultDocumentStore.getFile(detailPath);
      const parsed = parseFrontmatter(file.content);
      return NextResponse.json({ path: detailPath, frontmatter: parsed.data, body: parsed.body });
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
    let total: number | null = null;
    try { total = source === "supabase" ? await supabaseKnowledgeIndexRepository.count() : hits.length; } catch { total = null; }
    const weekAgo = Date.now() - 7 * 86_400_000;
    const recent = hits.filter((hit: { updated_at?: string | null; updated?: string }) => { const value = hit.updated_at ?? hit.updated; return value ? new Date(value).getTime() >= weekAgo : false; }).length;
    return NextResponse.json({ source, warning, hits, candidates, kpis: { knowledge: total, candidate: candidates.length, review: candidates.filter((item) => item.frontmatter.domain_resolution_required || item.frontmatter.conflict_candidates?.length).length, addedThisWeek: source === "supabase" ? recent : null } });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Knowledgeを取得できません" }, { status: 500 }); }
}

export async function POST() {
  try { return NextResponse.json({ ok: true, ...(await resyncKnowledgeIndex()) }); }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "同期できません" }, { status: 503 }); }
}
