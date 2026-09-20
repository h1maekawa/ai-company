import { createHash } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { loadDecisions } from "@/app/lib/fund/store";
import { appendDecisionOutcome, loadDecisionOutcomes } from "@/app/lib/fund/learning/store";
import type { InvestmentDecisionOutcome, OutcomeHorizon, ThesisStatus } from "@/app/lib/fund/learning/types";
import { createInvestmentDecisionOutcome } from "@/app/lib/fund/learning/engine";
import { getExecutionStore } from "@/app/lib/company/execution/store";
import { assertProductionMutationAllowed } from "@/app/lib/company/runtime/environment";

const HORIZONS: OutcomeHorizon[] = ["1W", "1M", "3M", "6M"];
const THESIS: ThesisStatus[] = ["MAINTAINED", "WEAKENED", "INVALIDATED", "UNKNOWN"];

export const dynamic = "force-dynamic";

export async function GET(): Promise<NextResponse> {
  try { return NextResponse.json({ success: true, outcomes: await loadDecisionOutcomes() }); }
  catch { return NextResponse.json({ error: "Outcomeの取得に失敗しました" }, { status: 500 }); }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    assertProductionMutationAllowed();
    const body = await request.json();
    const decision = (await loadDecisions()).find((item) => item.id === body.decisionId);
    if (!decision || !decision.recommendationId) {
      return NextResponse.json({ error: "有効なDecisionとRecommendation参照が必要です" }, { status: 400 });
    }
    if (!HORIZONS.includes(body.horizon)) {
      return NextResponse.json({ error: "horizonが不正です" }, { status: 400 });
    }
    if (body.source !== "market_data" && body.source !== "manual") {
      return NextResponse.json({ error: "sourceが不正です" }, { status: 400 });
    }
    if (body.source === "manual" && body.confirmedByHuman !== true) {
      return NextResponse.json({ error: "manual Outcomeは本人確認が必要です" }, { status: 400 });
    }
    if (body.thesisStatus != null && !THESIS.includes(body.thesisStatus)) {
      return NextResponse.json({ error: "thesisStatusが不正です" }, { status: 400 });
    }
    const now = new Date().toISOString();
    const outcome: InvestmentDecisionOutcome = createInvestmentDecisionOutcome({
      id: `decision-outcome-${Date.now()}`,
      decisionId: decision.id,
      recommendationId: decision.recommendationId,
      ticker: decision.ticker,
      horizon: body.horizon,
      observedAt: typeof body.observedAt === "string" ? body.observedAt : now,
      referencePriceAtDecision: body.referencePriceAtDecision,
      observedPrice: body.observedPrice,
      thesisStatus: body.thesisStatus ?? null,
      source: body.source,
      notes: typeof body.notes === "string" ? body.notes : null,
    });
    const key = request.headers.get("idempotency-key") ??
      createHash("sha256").update(JSON.stringify(body)).digest("hex");
    const store = getExecutionStore();
    const prior = await store.getIdempotencyResult<Record<string, unknown>>("fund-decision-outcome", key);
    if (prior) return NextResponse.json(prior);
    if (!(await store.claimIdempotency("fund-decision-outcome", key))) {
      return NextResponse.json({ error: "DUPLICATE_REQUEST_IN_PROGRESS" }, { status: 409 });
    }
    await appendDecisionOutcome(outcome);
    const response = { success: true, outcome };
    await store.completeIdempotency("fund-decision-outcome", key, response);
    return NextResponse.json(response);
  } catch (error) {
    console.error("[Fund Outcomes API] Error:", error);
    return NextResponse.json({ error: "Outcomeの保存に失敗しました" }, { status: 500 });
  }
}
