import { NextRequest, NextResponse } from "next/server";
import { createManualMission } from "@/app/lib/company/execution/service";
import { getExecutionStore } from "@/app/lib/company/execution/store";
import { isSameOriginMutation } from "@/app/lib/company/execution/requestProtection";
import { POST as createEngineeringRequest } from "@/app/api/engineering/requests/route";
import { DIRECTIVE_ROUTING, routeCreatorDirective, type DepartmentDirectiveDraft } from "@/app/lib/mobile-ceo/departments";

export async function POST(req: NextRequest) {
  if (!isSameOriginMutation(req)) return NextResponse.json({ error: "ORIGIN_DENIED" }, { status: 403 });
  const body = await req.json().catch(() => null) as { draftId?: string; confirmedByHuman?: boolean; directive?: unknown } | null;
  if (body?.directive !== undefined) return NextResponse.json({ error: "CLIENT_DRAFT_TAMPERING_REJECTED" }, { status: 400 });
  if (!body?.draftId || body.confirmedByHuman !== true) return NextResponse.json({ error: "HUMAN_CONFIRMATION_REQUIRED" }, { status: 400 });
  const store = getExecutionStore(); const stored = await store.getIdempotencyResult<{ directive: DepartmentDirectiveDraft }>("department-directive-draft", body.draftId);
  if (!stored?.directive || stored.directive.status !== "DRAFT") return NextResponse.json({ error: "DIRECTIVE_DRAFT_NOT_FOUND" }, { status: 404 });
  const d = stored.directive; if (Date.now() - new Date(d.createdAt).getTime() > 86_400_000) return NextResponse.json({ error: "DIRECTIVE_DRAFT_EXPIRED" }, { status: 410 });
  const key = d.id; const prior = await store.getIdempotencyResult<Record<string, unknown>>("department-directive", key); if (prior) return NextResponse.json(prior);
  if (!(await store.claimIdempotency("department-directive", key))) return NextResponse.json({ error: "DUPLICATE_REQUEST_IN_PROGRESS" }, { status: 409 });
  if (d.department === "engineering") {
    const engineeringReq = new NextRequest(new URL("/api/engineering/requests", req.nextUrl.origin), { method: "POST", headers: { "content-type": "application/json", "idempotency-key": `${d.id}:engineering`, origin: req.nextUrl.origin }, body: JSON.stringify({ title: d.instruction.slice(0,120), goal: d.goal || d.instruction, acceptanceCriteria: `CEO Directive ${d.id}を満たし、CIが通ること`, taskType: "feature", priority: d.priority === "A" ? "high" : d.priority === "C" ? "low" : "medium", confirmedByHuman: true }) });
    const response = await createEngineeringRequest(engineeringReq); const payload = await response.json(); if (!response.ok) return NextResponse.json(payload, { status: response.status });
    const result = { directive: { ...d, status: "ROUTED", approvedByHuman: true }, route: "ENGINEERING_REQUEST", result: payload }; await store.completeIdempotency("department-directive", key, result); return NextResponse.json(result);
  }
  const routing = d.department === "creator" ? routeCreatorDirective(d.instruction, d.goal) : DIRECTIVE_ROUTING[d.department];
  const mission = await createManualMission({ title: `[${routing.missionType}] ${d.instruction.slice(0,90)}`, description: `${d.goal || d.instruction}\nPriority: ${d.priority}\nConstraints: ${routing.constraints.join(", ")}`, idempotencyKey: `${d.id}:mission`, routingContext: routing });
  if (!mission.ok) return NextResponse.json({ error: mission.error }, { status: mission.status });
  const result = { directive: { ...d, status: "MISSION_CREATED", approvedByHuman: true }, route: routing.missionType, mission: mission.data.mission }; await store.completeIdempotency("department-directive", key, result); return NextResponse.json(result);
}
