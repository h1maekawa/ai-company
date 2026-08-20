import { NextRequest, NextResponse } from "next/server";
import { vaultKnowledgeSearch, type KnowledgeQuery } from "@/app/lib/knowledge/search";
import { buildKnowledgeContext } from "@/app/lib/knowledge/router";
import { isKnowledgeStatus, type KnowledgeStatus } from "@/app/lib/knowledge/types";

// クエリパラメータとVaultの内容に依存するため常に動的実行する
export const dynamic = "force-dynamic";

/**
 * GET /api/knowledge/search
 *   ?q=検索語
 *   &domain=sales,kpi            （カンマ区切り。省略可）
 *   &tag=fs,interview            （カンマ区切り。省略可）
 *   &status=promoted,candidate   （カンマ区切り。省略可）
 *   &minImportance=1|2|3
 *   &limit=10
 *   &context=1                   （1のとき Knowledge Router で domain判定+context文字列も返す）
 *
 * ADR-D: metadata + 全文 + 簡易ranking。semantic/vector は未使用。
 */
export async function GET(req: NextRequest) {
  try {
    const sp = req.nextUrl.searchParams;
    const text = sp.get("q")?.trim() || "";
    const csv = (key: string): string[] =>
      (sp.get(key) || "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);

    const domains = csv("domain");
    const tags = csv("tag");
    const statusRaw = csv("status");
    const status = statusRaw.filter(isKnowledgeStatus) as KnowledgeStatus[];
    const minImportanceRaw = parseInt(sp.get("minImportance") || "", 10);
    const minImportance =
      minImportanceRaw === 1 || minImportanceRaw === 2 || minImportanceRaw === 3
        ? (minImportanceRaw as 1 | 2 | 3)
        : undefined;
    const limit = Math.min(Math.max(parseInt(sp.get("limit") || "10", 10) || 10, 1), 50);
    const wantContext = sp.get("context") === "1";

    if (wantContext) {
      const ctx = await buildKnowledgeContext(text, { limit });
      return NextResponse.json({
        query: text,
        detectedDomains: ctx.detectedDomains,
        count: ctx.hits.length,
        hits: ctx.hits,
        contextText: ctx.contextText,
      });
    }

    const query: KnowledgeQuery = {
      text: text || undefined,
      domains: domains.length ? domains : undefined,
      tags: tags.length ? tags : undefined,
      status: status.length ? status : undefined,
      minImportance,
      limit,
    };

    const hits = await vaultKnowledgeSearch.search(query);
    return NextResponse.json({ query: text, count: hits.length, hits });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "不明なエラー";
    console.error("Error in GET /api/knowledge/search:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
