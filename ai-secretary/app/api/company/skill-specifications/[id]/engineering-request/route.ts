import { NextRequest, NextResponse } from "next/server";
import { assertSpecificationCanCreateIssue, skillIssueBody } from "@/app/lib/company/evolution/skillEngineering";
import { executionTransaction } from "@/app/lib/company/execution/transaction";
import { getExecutionStore, loadExecutionState, saveExecutionState } from "@/app/lib/company/execution/store";
import { isSameOriginMutation } from "@/app/lib/company/execution/requestProtection";
import { listSkills } from "@/app/lib/skills/registry";
import { createEngineeringIssue, githubCredentialAvailable } from "@/app/lib/engineering/githubRequests";

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  if (!isSameOriginMutation(req)) return NextResponse.json({ error: "ORIGIN_DENIED" }, { status: 403 });
  if (!githubCredentialAvailable()) return NextResponse.json({ error: "GITHUB_CREDENTIAL_UNAVAILABLE" }, { status: 503 });
  const key = req.headers.get("idempotency-key");
  if (!key) return NextResponse.json({ error: "IDEMPOTENCY_KEY_REQUIRED" }, { status: 400 });
  const fingerprint = `engineering-specification:${params.id}`;
  const store = getExecutionStore();
  const prior = await store.getIdempotencyResult<{ handoff: unknown }>("skill-engineering-request", fingerprint);
  if (prior) return NextResponse.json(prior);
  const state = await loadExecutionState();
  const existing = state.skillEngineeringHandoffs.find((item) => item.specificationId === params.id);
  if (existing) return NextResponse.json({ handoff: existing });
  const specification = state.skillEngineeringSpecifications.find((item) => item.id === params.id);
  if (!specification) return NextResponse.json({ error: "SPECIFICATION_NOT_FOUND" }, { status: 404 });
  try { assertSpecificationCanCreateIssue(specification, listSkills()); }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "ENGINEERING_BLOCKED" }, { status: 409 }); }
  if (!(await store.claimIdempotency("skill-engineering-request", fingerprint))) return NextResponse.json({ error: "DUPLICATE_REQUEST_IN_PROGRESS" }, { status: 409 });
  try {
    const issue = await createEngineeringIssue({ title: `[Skill] ${specification.title}`, body: skillIssueBody(specification), labels: ["ai-engineering", "skill-candidate", "type:feature", "priority:medium", `risk:${specification.risk.toLowerCase()}`] });
    const handoff = await executionTransaction(async () => {
      const fresh = await loadExecutionState();
      const already = fresh.skillEngineeringHandoffs.find((item) => item.specificationId === params.id);
      if (already) return already;
      const created = { candidateId: specification.skillCandidateId, specificationId: specification.id, githubIssueNumber: issue.number, githubIssueUrl: issue.html_url, createdAt: new Date().toISOString(), workerStatus: "WAITING_AI_READY" } as const;
      await saveExecutionState({ ...fresh, skillEngineeringHandoffs: [...fresh.skillEngineeringHandoffs, created] });
      return created;
    });
    const result = { handoff, aiReady: false };
    await store.completeIdempotency("skill-engineering-request", fingerprint, result);
    return NextResponse.json(result, { status: 201 });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "ISSUE_CREATE_FAILED" }, { status: 502 }); }
}
