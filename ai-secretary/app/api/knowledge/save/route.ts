import { NextRequest, NextResponse } from "next/server";
import { captureToInbox, prepareCandidate } from "@/app/lib/knowledge/lifecycle";
import { resolveDomain } from "@/app/lib/knowledge/domain";
import type { AiOrganizeResult } from "@/app/lib/knowledge/types";
import type { CanonicalDomain } from "@/app/lib/knowledge/domain";

/**
 * POST /api/knowledge/save
 *
 * Phase4 修正1（重要な仕様変更）:
 * このAPIは **正式Knowledge（Human Managed）を直接作成しない**。
 * 汎用の保存APIから Human Managed 領域を書き換えられないことをコードで保証するため、
 * 受け取った内容は Inbox の Candidate として保存する。
 * 正式Knowledge化は /weekly-review での人間承認（POST /api/knowledge/promote）のみ。
 *
 * レスポンスは後方互換のため { success, path, id } を維持する（path は Inbox のパス）。
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { title, slug, category, domain, importance, content, tags } = body;
    const rawClass = domain ?? category;

    if (!title || !slug || !rawClass || !content) {
      return NextResponse.json(
        { error: "必須パラメータ（title, slug, category|domain, content）が不足しています。" },
        { status: 400 }
      );
    }

    // domain は解決できなくてもエラーにしない（Candidateとして保持し、昇格時に人間が確定する）
    const resolved = resolveDomain(rawClass).domain;
    const domainCandidates: CanonicalDomain[] = resolved ? [resolved] : [];

    const captured = await captureToInbox({
      content: String(content),
      source: "manual",
      title: String(title),
    });

    const organize: AiOrganizeResult = {
      summary: "",
      title: String(title),
      domainCandidates,
      tags: Array.isArray(tags) ? tags.map(String) : [],
      duplicateCandidates: [],
      conflictCandidates: [],
      recommendedAction: resolved ? "promote" : "hold",
      promotionTargets: [],
    };
    const candidate = await prepareCandidate(captured.path, organize);

    return NextResponse.json({
      success: true,
      path: candidate.path,
      id: candidate.frontmatter.id,
      status: candidate.frontmatter.status,
      importance: importance ?? 1,
      slug,
      note: "Candidateとして保存しました。正式Knowledge化は /weekly-review で承認してください。",
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "不明なエラー";
    console.error("Error in POST /api/knowledge/save:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
