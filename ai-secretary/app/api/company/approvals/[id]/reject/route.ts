import { NextRequest, NextResponse } from "next/server";
import { decideApprovalRequest } from "@/app/lib/company/execution/service";
import { getExecutionStore } from "@/app/lib/company/execution/store";

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
    const store = getExecutionStore();
    const idempotencyKey = req.headers.get("idempotency-key") ?? params.id + ":REJECTED";
    const prior = await store.getIdempotencyResult<{ ok: boolean }>("approval", idempotencyKey);
    if (prior) return NextResponse.json(prior);
    if (!(await store.claimIdempotency("approval", idempotencyKey)))
      return NextResponse.json({ error: "DUPLICATE_REQUEST_IN_PROGRESS" }, { status: 409 });
    const body = await req.json().catch(() => ({}));
    const result = await decideApprovalRequest({
      approvalId: params.id,
      decision: "REJECTED",
      reason: body.reason,
    });
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
    const response = { ok: true };
    await store.completeIdempotency("approval", idempotencyKey, response);
    return NextResponse.json(response);
  } catch (error) {
    console.error("[api/company/approvals/reject] 失敗:", error);
    return NextResponse.json({ error: "却下に失敗しました" }, { status: 500 });
  }
}
