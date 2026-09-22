import { NextRequest, NextResponse } from "next/server";
import { executionTransaction } from "@/app/lib/company/execution/transaction";
import { getExecutionStore, loadExecutionState, saveExecutionState } from "@/app/lib/company/execution/store";
import { isSameOriginMutation } from "@/app/lib/company/execution/requestProtection";

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  if (!isSameOriginMutation(req)) return NextResponse.json({ error: "ORIGIN_DENIED" }, { status: 403 });
  const key = req.headers.get("idempotency-key"); if (!key) return NextResponse.json({ error: "IDEMPOTENCY_KEY_REQUIRED" }, { status: 400 });
  const body = await req.json().catch(() => ({})); const decision = body.decision as "APPROVED" | "HOLD" | "REJECTED";
  if (!["APPROVED", "HOLD", "REJECTED"].includes(decision)) return NextResponse.json({ error: "INVALID_DECISION" }, { status: 400 });
  const store = getExecutionStore(); const prior = await store.getIdempotencyResult("skill-improvement-decision", key); if (prior) return NextResponse.json(prior);
  if (!(await store.claimIdempotency("skill-improvement-decision", key))) return NextResponse.json({ error: "DUPLICATE_REQUEST_IN_PROGRESS" }, { status: 409 });
  try { const candidate = await executionTransaction(async () => { const state = await loadExecutionState(); const runtime = state.runtime; const current = runtime?.skillImprovementCandidates?.find((item) => item.id === params.id); if (!runtime || !current || current.status !== "PROPOSED") throw new Error("IMPROVEMENT_CANDIDATE_NOT_FOUND"); const next = { ...current, status: decision, updatedAt: new Date().toISOString(), executable: false as const, registryMutationAllowed: false as const, engineeringHandoffAllowed: false as const }; await saveExecutionState({ ...state, runtime: { ...runtime, skillImprovementCandidates: runtime.skillImprovementCandidates!.map((item) => item.id === next.id ? next : item) } }); return next; }); const result = { candidate, codeChanged: false, registryChanged: false, engineeringStarted: false }; await store.completeIdempotency("skill-improvement-decision", key, result); return NextResponse.json(result); } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "DECISION_FAILED" }, { status: 409 }); }
}
