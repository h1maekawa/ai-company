import { NextRequest, NextResponse } from "next/server";
import { createManualMission } from "@/app/lib/company/execution/service";
import { getExecutionStore } from "@/app/lib/company/execution/store";
import { isSameOriginMutation } from "@/app/lib/company/execution/requestProtection";
import { POST as createEngineeringRequest } from "@/app/api/engineering/requests/route";
import { DEPARTMENT_IDS, type DepartmentDirectiveDraft, type DepartmentId } from "@/app/lib/mobile-ceo/departments";

export async function POST(req: NextRequest) {
  if (!isSameOriginMutation(req)) return NextResponse.json({ error: "ORIGIN_DENIED" }, { status: 403 });
  const body = await req.json().catch(() => null) as { directive?: DepartmentDirectiveDraft; confirmedByHuman?: boolean } | null;
  if (!body?.directive || body.confirmedByHuman !== true || body.directive.status !== "DRAFT") return NextResponse.json({ error: "HUMAN_CONFIRMATION_REQUIRED" }, { status: 400 });
  if (!DEPARTMENT_IDS.includes(body.directive.department as DepartmentId)) return NextResponse.json({ error: "UNKNOWN_DEPARTMENT" }, { status: 400 });
  const key = req.headers.get("idempotency-key"); if (!key) return NextResponse.json({ error: "IDEMPOTENCY_KEY_REQUIRED" }, { status: 400 });
  const store = getExecutionStore(); const prior = await store.getIdempotencyResult<Record<string, unknown>>("department-directive", key); if (prior) return NextResponse.json(prior);
  if (!(await store.claimIdempotency("department-directive", key))) return NextResponse.json({ error: "DUPLICATE_REQUEST_IN_PROGRESS" }, { status: 409 });
  const d = body.directive;
  if (d.department === "engineering") {
    const engineeringReq = new NextRequest(new URL("/api/engineering/requests", req.nextUrl.origin), { method: "POST", headers: { "content-type": "application/json", "idempotency-key": `${key}:engineering`, origin: req.nextUrl.origin }, body: JSON.stringify({ title: d.instruction.slice(0,120), goal: d.goal || d.instruction, acceptanceCriteria: `CEO Directive ${d.id}を満たし、CIが通ること`, taskType: "feature", priority: d.priority === "A" ? "high" : d.priority === "C" ? "low" : "medium", confirmedByHuman: true }) });
    const response = await createEngineeringRequest(engineeringReq); const payload = await response.json(); if (!response.ok) return NextResponse.json(payload, { status: response.status });
    const result = { directive: { ...d, status: "ROUTED", approvedByHuman: true }, route: "ENGINEERING_REQUEST", result: payload }; await store.completeIdempotency("department-directive", key, result); return NextResponse.json(result);
  }
  const researchBoundary = d.department === "fund" ? "Research/analysis only. Never place or submit a securities order. HUMAN_ONLY." : "No external publish or send without a separate human approval.";
  const mission = await createManualMission({ title: `[${d.department}] ${d.instruction.slice(0,100)}`, description: `${d.goal || d.instruction}\nPriority: ${d.priority}\n${researchBoundary}`, idempotencyKey: `${key}:mission` });
  if (!mission.ok) return NextResponse.json({ error: mission.error }, { status: mission.status });
  const result = { directive: { ...d, status: "MISSION_CREATED", approvedByHuman: true }, route: d.department === "fund" ? "FUND_RESEARCH_MISSION" : "MANUAL_MISSION", mission: mission.data.mission }; await store.completeIdempotency("department-directive", key, result); return NextResponse.json(result);
}
