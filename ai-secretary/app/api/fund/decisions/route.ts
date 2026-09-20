import { createHash } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { appendDecision, loadDecisions, loadRecommendations, type DecisionAction } from "@/app/lib/fund/store";
import { isReasonTag, type HumanDecisionDisposition, type IntendedInvestmentAction } from "@/app/lib/fund/learning/types";
import { getExecutionStore } from "@/app/lib/company/execution/store";
import { assertProductionMutationAllowed } from "@/app/lib/company/runtime/environment";

const ACTIONS: DecisionAction[] = ["acknowledged", "bought", "skipped", "trimmed", "sold"];
const DISPOSITIONS: HumanDecisionDisposition[] = ["ACCEPT", "REJECT", "DEFER", "MODIFY"];
const INTENDED_ACTIONS: IntendedInvestmentAction[] = ["BUY", "ADD", "HOLD", "TRIM", "EXIT", "WAIT"];

export const dynamic = "force-dynamic";

export async function GET(): Promise<NextResponse> {
  try { return NextResponse.json({ success: true, decisions: await loadDecisions() }); }
  catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/** 本人判断の記録だけを行う。ACCEPTを含め、証券注文・Executorには接続しない。 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    assertProductionMutationAllowed();
    const body = await request.json();
    if (!body?.ticker || typeof body.ticker !== "string") {
      return NextResponse.json({ error: "ticker は必須です" }, { status: 400 });
    }
    const hasLegacyAction = ACTIONS.includes(body.action);
    const hasDisposition = DISPOSITIONS.includes(body.disposition);
    if (!hasLegacyAction && !hasDisposition) {
      return NextResponse.json({ error: "dispositionまたは既存actionのいずれかが必要です" }, { status: 400 });
    }
    if (hasDisposition && body.confirmedByHuman !== true) {
      return NextResponse.json({ error: "Human Decisionは本人確認済みである必要があります" }, { status: 400 });
    }
    if (body.intendedAction != null && !INTENDED_ACTIONS.includes(body.intendedAction)) {
      return NextResponse.json({ error: "intendedActionが不正です" }, { status: 400 });
    }
    if (body.amountJpy != null && (!Number.isFinite(body.amountJpy) || body.amountJpy < 0)) {
      return NextResponse.json({ error: "amountJpyは0以上の数値にしてください" }, { status: 400 });
    }
    if (body.shares != null && (!Number.isFinite(body.shares) || body.shares < 0)) {
      return NextResponse.json({ error: "sharesは0以上の数値にしてください" }, { status: 400 });
    }
    const reasonTags = body.reasonTags ?? [];
    if (!Array.isArray(reasonTags) || !reasonTags.every(isReasonTag)) {
      return NextResponse.json({ error: "reasonTagsはslug形式の配列にしてください" }, { status: 400 });
    }

    const recommendations = await loadRecommendations();
    const recommendation = body.recommendationId
      ? recommendations.find((item) => item.id === body.recommendationId)
      : undefined;
    if (hasDisposition && !recommendation) {
      return NextResponse.json({ error: "構造化Decisionには有効なrecommendationIdが必要です" }, { status: 400 });
    }

    const store = getExecutionStore();
    const idempotencyKey = request.headers.get("idempotency-key") ??
      createHash("sha256").update(JSON.stringify(body)).digest("hex");
    const prior = await store.getIdempotencyResult<Record<string, unknown>>("fund-human-decision", idempotencyKey);
    if (prior) return NextResponse.json(prior);
    if (!(await store.claimIdempotency("fund-human-decision", idempotencyKey))) {
      return NextResponse.json({ error: "DUPLICATE_REQUEST_IN_PROGRESS" }, { status: 409 });
    }

    const decision = await appendDecision({
      recommendationId: body.recommendationId ?? null,
      ticker: body.ticker,
      action: hasLegacyAction ? body.action : null,
      disposition: hasDisposition ? body.disposition : undefined,
      reason: typeof body.reason === "string" ? body.reason.trim() || null : null,
      reasonTags,
      intendedAction: body.intendedAction ?? null,
      note: body.note ?? null,
      amountJpy: typeof body.amountJpy === "number" ? Math.floor(body.amountJpy) : null,
      shares: typeof body.shares === "number" ? Math.floor(body.shares) : null,
      recommendationSnapshot: recommendation ? {
        decision: recommendation.decision,
        score: recommendation.score,
        confidence: recommendation.confidence,
        horizon: recommendation.horizon,
        dataAsOf: recommendation.dataAsOf,
        policyVersion: recommendation.policyVersion,
      } : undefined,
    });
    const response = { success: true, decision };
    await store.completeIdempotency("fund-human-decision", idempotencyKey, response);
    return NextResponse.json(response);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("[Fund Decisions API] Error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
