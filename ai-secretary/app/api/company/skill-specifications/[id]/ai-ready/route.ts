import { NextRequest, NextResponse } from "next/server";
import { executionTransaction } from "@/app/lib/company/execution/transaction";
import { getExecutionStore, loadExecutionState, saveExecutionState } from "@/app/lib/company/execution/store";
import { isSameOriginMutation } from "@/app/lib/company/execution/requestProtection";
import { addAiReadyLabel, githubCredentialAvailable } from "@/app/lib/engineering/githubRequests";

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  if (!isSameOriginMutation(req)) return NextResponse.json({ error: "ORIGIN_DENIED" }, { status: 403 });
  if (!githubCredentialAvailable()) return NextResponse.json({ error: "GITHUB_CREDENTIAL_UNAVAILABLE" }, { status: 503 });
  const key = req.headers.get("idempotency-key");
  if (!key) return NextResponse.json({ error: "IDEMPOTENCY_KEY_REQUIRED" }, { status: 400 });
  const fingerprint = `engineering-specification:${params.id}`;
  const store = getExecutionStore();
  const prior = await store.getIdempotencyResult<{ handoff: unknown }>("skill-ai-ready", fingerprint);
  if (prior) return NextResponse.json(prior);
  const state = await loadExecutionState();
  const handoff = state.skillEngineeringHandoffs.find((item) => item.specificationId === params.id);
  if (!handoff) return NextResponse.json({ error: "BOUND_ENGINEERING_REQUEST_NOT_FOUND" }, { status: 404 });
  if (handoff.aiReadyApprovedAt) return NextResponse.json({ handoff, aiReady: true });
  if (!(await store.claimIdempotency("skill-ai-ready", fingerprint))) return NextResponse.json({ error: "DUPLICATE_REQUEST_IN_PROGRESS" }, { status: 409 });
  try {
    await addAiReadyLabel(handoff.githubIssueNumber);
    const updated = await executionTransaction(async () => {
      const fresh = await loadExecutionState();
      const current = fresh.skillEngineeringHandoffs.find((item) => item.specificationId === params.id);
      if (!current) throw new Error("BOUND_ENGINEERING_REQUEST_NOT_FOUND");
      const next = { ...current, aiReadyApprovedAt: new Date().toISOString(), aiReadyApprovedBy: "ceo" as const, workerStatus: "READY_FOR_WORKER" };
      await saveExecutionState({ ...fresh, skillEngineeringHandoffs: fresh.skillEngineeringHandoffs.map((item) => item.specificationId === params.id ? next : item) });
      return next;
    });
    const result = { handoff: updated, aiReady: true };
    await store.completeIdempotency("skill-ai-ready", fingerprint, result);
    return NextResponse.json(result);
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "AI_READY_FAILED" }, { status: 409 }); }
}
