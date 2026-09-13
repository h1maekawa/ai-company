import { executionTransaction } from "@/app/lib/company/execution/transaction";
import { syncRevenueLearning } from "@/app/lib/company/execution/revenueLearning";
import { NextRequest, NextResponse } from "next/server";
import {
  appendRevenueEntry,
  createRevenueEntry,
  effectiveEntries,
  loadRevenueEntries,
  validateRevenueInput,
  type RevenueEntry,
} from "@/app/lib/company/revenueStore";
import { summarizeRevenue } from "@/app/lib/company/revenue";
import { evaluateAchievements } from "@/app/lib/company/achievements";
import { createHash } from "node:crypto";
import { getExecutionStore } from "@/app/lib/company/execution/store";

export const dynamic = "force-dynamic";

/** GET /api/company/revenue — 収益履歴と集計（Phase 5 §4） */
export async function GET(): Promise<NextResponse> {
  try {
    const entries = await loadRevenueEntries();
    const effective = effectiveEntries(entries);
    const allTime = summarizeRevenue(effective);

    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);
    const thisMonth = summarizeRevenue(effective, { since: monthStart.toISOString() });

    return NextResponse.json({
      entries: [...entries].sort((a, b) => b.occurredAt.localeCompare(a.occurredAt)),
      allTime,
      thisMonth,
      achievements: evaluateAchievements({ aiGeneratedRevenueYen: allTime.aiGeneratedYen }),
    });
  } catch (error) {
    console.error("[api/company/revenue] GET失敗:", error);
    return NextResponse.json({ error: "収益履歴の取得に失敗しました" }, { status: 500 });
  }
}

/**
 * POST /api/company/revenue — 収益を記録する（Phase 5 §4 / §5 / §9）
 *
 * 履歴は追記のみ。修正・取消は kind を指定して別エントリとして積む。
 * confirmedByHuman は明示が必須で、false のものは正式集計に入らない。
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const body = (await req.json()) as Partial<RevenueEntry>;

    const validation = validateRevenueInput(body);
    if (!validation.ok) {
      return NextResponse.json({ error: validation.error }, { status: 400 });
    }
    const store = getExecutionStore();
    const idempotencyKey = req.headers.get("idempotency-key") ??
      createHash("sha256").update(JSON.stringify(body)).digest("hex");
    const prior = await store.getIdempotencyResult<Record<string, unknown>>("revenue", idempotencyKey);
    if (prior) return NextResponse.json(prior);
    if (!(await store.claimIdempotency("revenue", idempotencyKey)))
      return NextResponse.json({ error: "DUPLICATE_REQUEST_IN_PROGRESS" }, { status: 409 });

    const entry = createRevenueEntry({
      amountYen: body.amountYen as number,
      sourceType: body.sourceType!,
      occurredAt: body.occurredAt ?? new Date().toISOString(),
      confirmedByHuman: body.confirmedByHuman as boolean,
      kind: body.kind,
      correctsId: body.correctsId,
      originTraceId: body.originTraceId,
      originAgentId: body.originAgentId,
      originSkillId: body.originSkillId,
      originWorkflowId: body.originWorkflowId,
      missionId: body.missionId,
      opportunityId: body.opportunityId,
      businessId: body.businessId,
      note: body.note,
    });

    const entries = await appendRevenueEntry(entry);
    let learningPending = false;
    try {
      await executionTransaction(() => syncRevenueLearning(entries));
    } catch {
      learningPending = true;
      const snapshot = await store.load();
      snapshot.state.runtime ??= { runs: {}, executions: [], artifacts: [], learning: [] };
      snapshot.state.runtime.learningQueue ??= [];
      if (!snapshot.state.runtime.learningQueue.some((item) => item.id === entry.id)) {
        snapshot.state.runtime.learningQueue.push({
          id: entry.id,
          kind: "revenue",
          payload: entry,
          attempts: 0,
          nextAttemptAt: new Date().toISOString(),
          createdAt: new Date().toISOString(),
        });
        await store.save(snapshot.state, { expectedVersion: snapshot.version });
      }
    }
    const allTime = summarizeRevenue(effectiveEntries(entries));

    const response = {
      ok: true,
      learningPending,
      entry,
      allTime,
      achievements: evaluateAchievements({ aiGeneratedRevenueYen: allTime.aiGeneratedYen }),
    };
    await store.completeIdempotency("revenue", idempotencyKey, response);
    return NextResponse.json(response);
  } catch (error) {
    console.error("[api/company/revenue] POST失敗:", error);
    return NextResponse.json({ error: "収益の記録に失敗しました" }, { status: 500 });
  }
}
