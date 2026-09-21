import { NextRequest, NextResponse } from "next/server";
import { reconcileSkillImplementation } from "@/app/lib/company/evolution/skillEngineering";
import { executionTransaction } from "@/app/lib/company/execution/transaction";
import { getExecutionStore, loadExecutionState, saveExecutionState } from "@/app/lib/company/execution/store";
import { isSameOriginMutation } from "@/app/lib/company/execution/requestProtection";
import { listSkills } from "@/app/lib/skills/registry";
import { findWorkerPullRequest, githubCredentialAvailable } from "@/app/lib/engineering/githubRequests";

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  if (!isSameOriginMutation(req)) return NextResponse.json({ error: "ORIGIN_DENIED" }, { status: 403 });
  if (!githubCredentialAvailable()) return NextResponse.json({ error: "GITHUB_CREDENTIAL_UNAVAILABLE" }, { status: 503 });
  const key = req.headers.get("idempotency-key");
  if (!key) return NextResponse.json({ error: "IDEMPOTENCY_KEY_REQUIRED" }, { status: 400 });
  const store = getExecutionStore();
  const prior = await store.getIdempotencyResult<{ handoff: unknown }>("skill-reconcile", key);
  if (prior) return NextResponse.json(prior);
  if (!(await store.claimIdempotency("skill-reconcile", key))) return NextResponse.json({ error: "DUPLICATE_REQUEST_IN_PROGRESS" }, { status: 409 });
  try {
    const current = await loadExecutionState();
    const specification = current.skillEngineeringSpecifications.find((item) => item.id === params.id);
    const handoff = current.skillEngineeringHandoffs.find((item) => item.specificationId === params.id);
    if (!specification || !handoff) return NextResponse.json({ error: "HANDOFF_NOT_FOUND" }, { status: 404 });
    const pull = await findWorkerPullRequest(handoff.githubIssueNumber);
    const reconciled = reconcileSkillImplementation(handoff, specification, listSkills(), pull);
    await executionTransaction(async () => {
      const fresh = await loadExecutionState();
      await saveExecutionState({ ...fresh, skillEngineeringHandoffs: fresh.skillEngineeringHandoffs.map((item) => item.specificationId === params.id ? reconciled : item) });
    });
    const result = { handoff: reconciled, reconciled: Boolean(reconciled.reconciledAt) };
    await store.completeIdempotency("skill-reconcile", key, result);
    return NextResponse.json(result);
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "RECONCILIATION_FAILED" }, { status: 409 }); }
}
