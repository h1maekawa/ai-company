import { NextRequest, NextResponse } from "next/server";
import { getBusinessManagerContract } from "@/app/lib/company/businessManager";
import { createBusinessDelegationMission } from "@/app/lib/company/execution/businessDelegation";
import { loadExecutionState } from "@/app/lib/company/execution/store";
import { isSameOriginMutation } from "@/app/lib/company/execution/requestProtection";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type RouteContext = { params: Promise<{ businessId: string }> };

/** Business-scoped Mission results read from the canonical Execution Store. */
export async function GET(_req: NextRequest, context: RouteContext) {
  const { businessId } = await context.params;
  const business = getBusinessManagerContract(businessId);
  if (!business) return NextResponse.json({ error: "UNKNOWN_BUSINESS" }, { status: 404 });
  try {
    const state = await loadExecutionState();
    const limitParam = Number(_req.nextUrl.searchParams.get("limit") ?? 50);
    const limit = Number.isInteger(limitParam) ? Math.min(100, Math.max(1, limitParam)) : 50;
    const missions = state.missions
      .filter((mission) => mission.businessId === business.id)
      .slice(-limit)
      .map((mission) => ({ mission, run: state.runtime?.runs[mission.id] ?? null }));
    return NextResponse.json({ businessId: business.id, missions });
  } catch {
    return NextResponse.json({ error: "EXECUTION_STORE_UNAVAILABLE" }, { status: 503 });
  }
}

/** Create a bounded Worker Mission; Manager authority is resolved from the Business Registry. */
export async function POST(req: NextRequest, context: RouteContext) {
  if (!isSameOriginMutation(req)) return NextResponse.json({ error: "ORIGIN_DENIED" }, { status: 403 });
  const { businessId } = await context.params;
  const business = getBusinessManagerContract(businessId);
  if (!business) return NextResponse.json({ error: "UNKNOWN_BUSINESS" }, { status: 404 });

  const body = await req.json().catch(() => null) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: "INVALID_REQUEST" }, { status: 400 });
  const budgetYen = body.budgetYen === undefined ? 0 : typeof body.budgetYen === "number" ? body.budgetYen : Number.NaN;
  const executionCount = body.executionCount === undefined ? 1 : typeof body.executionCount === "number" ? body.executionCount : Number.NaN;
  const deadline = body.deadline === undefined ? undefined : typeof body.deadline === "string" ? body.deadline : "";

  const result = await createBusinessDelegationMission({
    businessId: business.id,
    workerAgentId: typeof body.workerAgentId === "string" ? body.workerAgentId : "",
    title: body.title,
    description: body.description,
    budgetYen,
    executionCount,
    deadline,
    idempotencyKey: req.headers.get("idempotency-key") ?? undefined,
  });
  return result.ok
    ? NextResponse.json({ ok: true, ...result.data }, { status: result.data.replayed ? 200 : 201 })
    : NextResponse.json({ error: result.error }, { status: result.status });
}
