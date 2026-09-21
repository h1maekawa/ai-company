import { NextRequest, NextResponse } from "next/server";
import { decideSkillCandidate } from "@/app/lib/company/evolution/skillCandidates";
import { getExecutionStore, loadExecutionState, saveExecutionState } from "@/app/lib/company/execution/store";
import { executionTransaction } from "@/app/lib/company/execution/transaction";
import { isSameOriginMutation } from "@/app/lib/company/execution/requestProtection";

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  if (!isSameOriginMutation(req)) return NextResponse.json({ error: "ORIGIN_DENIED" }, { status: 403 });
  const key = req.headers.get("idempotency-key");
  if (!key) return NextResponse.json({ error: "IDEMPOTENCY_KEY_REQUIRED" }, { status: 400 });
  const body = await req.json().catch(() => ({}));
  const decision = body.decision as "APPROVED" | "REJECTED" | "HOLD";
  if (!["APPROVED", "REJECTED", "HOLD"].includes(decision)) return NextResponse.json({ error: "INVALID_DECISION" }, { status: 400 });
  if (decision === "REJECTED" && (typeof body.reason !== "string" || !body.reason.trim())) return NextResponse.json({ error: "REJECTION_REASON_REQUIRED" }, { status: 400 });
  const store = getExecutionStore();
  const prior = await store.getIdempotencyResult<{ candidate: unknown }>("skill-candidate-decision", key);
  if (prior) return NextResponse.json(prior);
  const current = await loadExecutionState();
  const candidate = current.skillCandidates.find((item) => item.id === params.id);
  if (!candidate) return NextResponse.json({ error: "SKILL_CANDIDATE_NOT_FOUND" }, { status: 404 });
  if (candidate.status !== "PROPOSED") return NextResponse.json({ error: "CANDIDATE_ALREADY_DECIDED" }, { status: 409 });
  if (!(await store.claimIdempotency("skill-candidate-decision", key))) return NextResponse.json({ error: "DUPLICATE_REQUEST_IN_PROGRESS" }, { status: 409 });
  try {
    const decided = await executionTransaction(async () => {
      const state = await loadExecutionState();
      const fresh = state.skillCandidates.find((item) => item.id === params.id);
      if (!fresh) throw new Error("SKILL_CANDIDATE_NOT_FOUND");
      const next = decideSkillCandidate(fresh, decision, typeof body.reason === "string" ? body.reason : undefined);
      await saveExecutionState({ ...state, skillCandidates: state.skillCandidates.map((item) => item.id === next.id ? next : item) });
      return next;
    });
    const response = { candidate: decided, engineeringStarted: false, registryChanged: false };
    await store.completeIdempotency("skill-candidate-decision", key, response);
    return NextResponse.json(response);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "DECISION_FAILED" }, { status: 409 });
  }
}
