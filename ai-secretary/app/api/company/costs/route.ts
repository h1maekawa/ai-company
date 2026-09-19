import { createHash } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import {
  createBusinessCostEntry,
  effectiveBusinessCostEntries,
  validateBusinessCostInput,
  type BusinessCostEntry,
} from "@/app/lib/company/businessCost";
import {
  appendBusinessCostEntry,
  loadBusinessCostEntries,
} from "@/app/lib/company/businessCostStore";
import { getExecutionStore } from "@/app/lib/company/execution/store";
import { assertProductionMutationAllowed } from "@/app/lib/company/runtime/environment";

export const dynamic = "force-dynamic";

export async function GET(): Promise<NextResponse> {
  try {
    const entries = await loadBusinessCostEntries();
    const effective = effectiveBusinessCostEntries(
      entries.filter((entry) => entry.confirmedByHuman)
    );
    return NextResponse.json({
      entries: [...entries].sort((a, b) => b.occurredAt.localeCompare(a.occurredAt)),
      confirmedCostYen: effective.reduce((sum, entry) => sum + entry.amountYen, 0),
      unconfirmedEntries: entries.filter((entry) => !entry.confirmedByHuman).length,
    });
  } catch (error) {
    console.error("[api/company/costs] GET失敗:", error);
    return NextResponse.json({ error: "事業コストの取得に失敗しました" }, { status: 500 });
  }
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    assertProductionMutationAllowed();
    const body = (await req.json()) as Partial<BusinessCostEntry>;
    const validation = validateBusinessCostInput(body);
    if (!validation.ok) {
      return NextResponse.json({ error: validation.error }, { status: 400 });
    }

    const store = getExecutionStore();
    const idempotencyKey =
      req.headers.get("idempotency-key") ??
      createHash("sha256").update(JSON.stringify(body)).digest("hex");
    const prior = await store.getIdempotencyResult<Record<string, unknown>>(
      "business-cost",
      idempotencyKey
    );
    if (prior) return NextResponse.json(prior);
    if (!(await store.claimIdempotency("business-cost", idempotencyKey))) {
      return NextResponse.json({ error: "DUPLICATE_REQUEST_IN_PROGRESS" }, { status: 409 });
    }

    const entry = createBusinessCostEntry({
      amountYen: body.amountYen as number,
      category: body.category!,
      occurredAt: body.occurredAt ?? new Date().toISOString(),
      confirmedByHuman: body.confirmedByHuman as boolean,
      kind: body.kind,
      correctsId: body.correctsId,
      missionId: body.missionId,
      opportunityId: body.opportunityId,
      contentId: body.contentId,
      sourceKnowledgeId: body.sourceKnowledgeId,
      businessId: body.businessId,
      originAgentId: body.originAgentId,
      originSkillId: body.originSkillId,
      originWorkflowId: body.originWorkflowId,
      originTraceId: body.originTraceId,
      note: body.note,
    });
    await appendBusinessCostEntry(entry);
    const response = { ok: true, entry };
    await store.completeIdempotency("business-cost", idempotencyKey, response);
    return NextResponse.json(response);
  } catch (error) {
    console.error("[api/company/costs] POST失敗:", error);
    return NextResponse.json({ error: "事業コストの記録に失敗しました" }, { status: 500 });
  }
}
