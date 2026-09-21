import { NextRequest, NextResponse } from "next/server";
import { createSkillEngineeringSpecification } from "@/app/lib/company/evolution/skillEngineering";
import { executionTransaction } from "@/app/lib/company/execution/transaction";
import { getExecutionStore, loadExecutionState, saveExecutionState } from "@/app/lib/company/execution/store";
import { isSameOriginMutation } from "@/app/lib/company/execution/requestProtection";
import { listSkills } from "@/app/lib/skills/registry";

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  if (!isSameOriginMutation(req)) return NextResponse.json({ error: "ORIGIN_DENIED" }, { status: 403 });
  const key = req.headers.get("idempotency-key");
  if (!key) return NextResponse.json({ error: "IDEMPOTENCY_KEY_REQUIRED" }, { status: 400 });
  const fingerprint = `candidate:${params.id}`;
  const store = getExecutionStore();
  const prior = await store.getIdempotencyResult<{ specification: unknown }>("skill-specification-create", fingerprint);
  if (prior) return NextResponse.json(prior);
  if (!(await store.claimIdempotency("skill-specification-create", fingerprint))) return NextResponse.json({ error: "DUPLICATE_REQUEST_IN_PROGRESS" }, { status: 409 });
  try {
    const specification = await executionTransaction(async () => {
      const state = await loadExecutionState();
      const existing = state.skillEngineeringSpecifications.find((item) => item.skillCandidateId === params.id);
      if (existing) return existing;
      const candidate = state.skillCandidates.find((item) => item.id === params.id);
      if (!candidate) throw new Error("SKILL_CANDIDATE_NOT_FOUND");
      const created = createSkillEngineeringSpecification(candidate, listSkills());
      await saveExecutionState({ ...state, skillEngineeringSpecifications: [...state.skillEngineeringSpecifications, created] });
      return created;
    });
    const result = { specification };
    await store.completeIdempotency("skill-specification-create", fingerprint, result);
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "SPECIFICATION_CREATE_FAILED" }, { status: 409 });
  }
}
