import { NextRequest, NextResponse } from "next/server";
import { decideApprovalRequest } from "@/app/lib/company/execution/service";

export const dynamic = "force-dynamic";

/**
 * POST /api/company/approvals/:id/reject（Phase 6 §27 / §28）
 * 却下してもMissionは FAILED にせず、REPLAN_REQUIRED へ戻す。
 */
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
): Promise<NextResponse> {
  try {
    const body = await req.json().catch(() => ({}));
    const result = await decideApprovalRequest({
      approvalId: params.id,
      decision: "REJECTED",
      reason: body.reason,
    });
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[api/company/approvals/reject] 失敗:", error);
    return NextResponse.json({ error: "却下に失敗しました" }, { status: 500 });
  }
}
