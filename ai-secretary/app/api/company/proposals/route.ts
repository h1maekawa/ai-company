import { NextRequest, NextResponse } from "next/server";
import { runOrganizationReview } from "@/app/lib/company/evolution/review";
import { loadProposals } from "@/app/lib/company/evolution/store";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * GET /api/company/proposals — 保存済みの提案を返す（読み取りのみ）
 *
 * ?analyze=1 を付けると解析を実行するが、保存はしない（dry run）。
 * 実際の保存は Phase 4 の定期レビューが行う。
 */
export async function GET(req: NextRequest): Promise<NextResponse> {
  try {
    const analyze = new URL(req.url).searchParams.get("analyze") === "1";

    if (analyze) {
      const result = await runOrganizationReview({ persist: false });
      return NextResponse.json({
        mode: "dry-run",
        status: result.analysis.status,
        reason: result.analysis.reason,
        patterns: result.analysis.patterns.length,
        proposals: result.proposals,
        visible: result.visible,
        suppressed: result.suppressed,
        bottlenecks: result.bottlenecks,
      });
    }

    const proposals = await loadProposals();
    return NextResponse.json({
      mode: "stored",
      proposals,
      visible: proposals.filter(
        (p) => p.status === "PROPOSED" || p.status === "HIGH_PRIORITY"
      ),
    });
  } catch (error) {
    console.error("[api/company/proposals] 失敗:", error);
    return NextResponse.json({ error: "提案の取得に失敗しました" }, { status: 500 });
  }
}
