import { NextRequest, NextResponse } from "next/server";
import {
  promoteCandidate,
  mergeCandidate,
  setCandidateStatus,
} from "@/app/lib/knowledge/lifecycle";
import { resolveDomain } from "@/app/lib/knowledge/domain";

/**
 * POST /api/knowledge/promote — Weekly Review からの人間承認アクション。
 *
 * body: {
 *   path: string,                                  // Candidate の path
 *   action: "promote" | "merge" | "hold" | "reject",
 *   domain?: string,                               // promote 時必須（11 canonical のいずれか）
 *   title?, slug?, importance?, tags?,             // promote 任意
 *   targetPath?: string,                           // merge 時必須（統合先Knowledge path）
 *   previewToken?: string,                         // merge 時必須（merge-preview の承認トークン）
 * }
 *
 * セキュリティ（Phase4 修正1）: このAPIは `approved` 等のフラグを受け取らない。
 * Human Managed 領域への書き込み承認は、promote/merge ハンドラ内部でのみ発行される
 * ApprovalGrant によって行われる（クライアントからは偽造不可能）。
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const path = typeof body?.path === "string" ? body.path : "";
    const action = body?.action;
    if (!path) return NextResponse.json({ error: "path は必須です。" }, { status: 400 });

    if (action === "promote") {
      const domain = typeof body?.domain === "string" ? body.domain : "";
      if (!domain || !resolveDomain(domain).domain) {
        return NextResponse.json(
          { error: "promote には canonical domain が必須です（11種のいずれか）。" },
          { status: 400 }
        );
      }
      const result = await promoteCandidate(path, {
        domain,
        title: body?.title,
        slug: body?.slug,
        importance:
          body?.importance === 1 || body?.importance === 2 || body?.importance === 3
            ? body.importance
            : undefined,
        tags: Array.isArray(body?.tags) ? body.tags.map(String) : undefined,
      });
      return NextResponse.json({ status: "promoted", ...result });
    }

    if (action === "merge") {
      const targetPath = typeof body?.targetPath === "string" ? body.targetPath : "";
      const previewToken = typeof body?.previewToken === "string" ? body.previewToken : "";
      if (!targetPath) {
        return NextResponse.json({ error: "merge には targetPath が必須です。" }, { status: 400 });
      }
      if (!previewToken) {
        return NextResponse.json(
          {
            error:
              "merge には previewToken が必須です。先に /api/knowledge/merge-preview でDiffを確認・承認してください。",
          },
          { status: 400 }
        );
      }
      const result = await mergeCandidate(path, targetPath, previewToken);
      return NextResponse.json({ status: "merged", ...result });
    }

    if (action === "hold" || action === "reject") {
      const result = await setCandidateStatus(path, action);
      return NextResponse.json({ status: result.frontmatter.status, item: result });
    }

    return NextResponse.json(
      { error: "action は promote|merge|hold|reject のいずれかです。" },
      { status: 400 }
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : "不明なエラー";
    console.error("Error in POST /api/knowledge/promote:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
