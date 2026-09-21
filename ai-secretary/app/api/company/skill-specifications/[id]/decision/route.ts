import { NextRequest, NextResponse } from "next/server";
import { decideSkillEngineeringSpecification } from "@/app/lib/company/evolution/skillEngineering";
import { executionTransaction } from "@/app/lib/company/execution/transaction";
import { getExecutionStore, loadExecutionState, saveExecutionState } from "@/app/lib/company/execution/store";
import { isSameOriginMutation } from "@/app/lib/company/execution/requestProtection";

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  if (!isSameOriginMutation(req)) return NextResponse.json({ error: "ORIGIN_DENIED" }, { status: 403 });
  const key = req.headers.get("idempotency-key");
  if (!key) return NextResponse.json({ error: "IDEMPOTENCY_KEY_REQUIRED" }, { status: 400 });
  const body = await req.json().catch(() => ({}));
  const decision = body.decision as "APPROVED_FOR_ENGINEERING" | "REJECTED";
  if (!["APPROVED_FOR_ENGINEERING", "REJECTED"].includes(decision)) return NextResponse.json({ error: "INVALID_DECISION" }, { status: 400 });
  const store = getExecutionStore();
  const prior = await store.getIdempotencyResult<{ specification: unknown }>("skill-specification-decision", key);
  if (prior) return NextResponse.json(prior);
  if (!(await store.claimIdempotency("skill-specification-decision", key))) return NextResponse.json({ error: "DUPLICATE_REQUEST_IN_PROGRESS" }, { status: 409 });
  try {
    const specification = await executionTransaction(async () => {
      const state = await loadExecutionState();
      const current = state.skillEngineeringSpecifications.find((item) => item.id === params.id);
      if (!current) throw new Error("SPECIFICATION_NOT_FOUND");
      const next = decideSkillEngineeringSpecification(current, decision, typeof body.reason === "string" ? body.reason : undefined);
      await saveExecutionState({ ...state, skillEngineeringSpecifications: state.skillEngineeringSpecifications.map((item) => item.id === next.id ? next : item) });
      return next;
    });
    const result = { specification, issueCreated: false, aiReady: false };
    await store.completeIdempotency("skill-specification-decision", key, result);
    return NextResponse.json(result);
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "SPECIFICATION_DECISION_FAILED" }, { status: 409 }); }
}
