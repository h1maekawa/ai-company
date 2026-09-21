import { NextResponse } from "next/server";
import { loadExecutionState } from "@/app/lib/company/execution/store";
import { applyExpiry } from "@/app/lib/company/execution/approval";

export const dynamic = "force-dynamic";

/** GET /api/company/approvals — 承認キュー（Phase 6 §27） */
export async function GET(): Promise<NextResponse> {
  try {
    const state = await loadExecutionState();
    const approvals = applyExpiry(state.approvals);

    return NextResponse.json({
      pending: approvals.filter((a) => a.status === "PENDING").map((approval) => {
        const target = state.actionRequests.find((request) => request.id === approval.actionRequestId)?.target;
        const candidateId = target?.startsWith("content-candidate:") ? target.slice("content-candidate:".length) : undefined;
        return { ...approval, contentDraftCandidate: candidateId ? state.contentDraftCandidates.find((candidate) => candidate.id === candidateId) : undefined };
      }),
      decided: approvals.filter((a) => a.status !== "PENDING").slice(-20),
      blockedActions: state.actionRequests.filter((a) => a.status === "BLOCKED"),
    });
  } catch (error) {
    console.error("[api/company/approvals] 失敗:", error);
    return NextResponse.json({ error: "承認キューの取得に失敗しました" }, { status: 500 });
  }
}
