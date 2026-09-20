import { createHash } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { loadDecisions, loadRecommendations } from "@/app/lib/fund/store";
import { buildInvestmentDecisionReviews, createInvestmentLearningCandidate } from "@/app/lib/fund/learning/engine";
import {
  appendLearningCandidate,
  appendLearningDecision,
  effectiveInvestmentLearnings,
  loadDecisionOutcomes,
  loadLearningCandidates,
  loadLearningDecisions,
} from "@/app/lib/fund/learning/store";
import type { InvestmentLearning, InvestmentLearningDecision } from "@/app/lib/fund/learning/types";
import { getExecutionStore } from "@/app/lib/company/execution/store";
import { assertProductionMutationAllowed } from "@/app/lib/company/runtime/environment";

export const dynamic = "force-dynamic";

export async function GET(): Promise<NextResponse> {
  try {
    const [candidates, decisions] = await Promise.all([loadLearningCandidates(), loadLearningDecisions()]);
    return NextResponse.json({ success: true, learnings: effectiveInvestmentLearnings(candidates, decisions) });
  } catch { return NextResponse.json({ error: "Learningの取得に失敗しました" }, { status: 500 }); }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    assertProductionMutationAllowed();
    const body = await request.json();
    if (!['generate', 'approve', 'reject'].includes(body.action)) {
      return NextResponse.json({ error: "actionが不正です" }, { status: 400 });
    }
    let learning: InvestmentLearning | undefined;
    let learningDecision: InvestmentLearningDecision | undefined;
    if (body.action === "generate") {
      if (!Array.isArray(body.decisionIds) || body.decisionIds.length === 0) {
        return NextResponse.json({ error: "decisionIdsが必要です" }, { status: 400 });
      }
      const [recommendations, decisions, outcomes, candidates, learningDecisions] = await Promise.all([
        loadRecommendations(), loadDecisions(), loadDecisionOutcomes(), loadLearningCandidates(), loadLearningDecisions(),
      ]);
      const effective = effectiveInvestmentLearnings(candidates, learningDecisions);
      const reviews = buildInvestmentDecisionReviews({ recommendations, decisions, outcomes, learnings: effective })
        .filter((review) => body.decisionIds.includes(review.humanDecision.id));
      if (reviews.length !== new Set(body.decisionIds).size) {
        return NextResponse.json({ error: "存在しないDecision IDが含まれています" }, { status: 400 });
      }
      learning = createInvestmentLearningCandidate(reviews);
    } else {
      if (body.confirmedByHuman !== true || typeof body.learningId !== "string") {
        return NextResponse.json({ error: "Learning判断には本人確認とlearningIdが必要です" }, { status: 400 });
      }
      const candidate = (await loadLearningCandidates()).find((item) => item.id === body.learningId);
      if (!candidate) return NextResponse.json({ error: "Learning Candidateがありません" }, { status: 404 });
      learningDecision = {
        id: `investment-learning-decision-${Date.now()}`,
        learningId: candidate.id,
        decision: body.action === "approve" ? "approved" : "rejected",
        decidedAt: new Date().toISOString(),
        confirmedByHuman: true,
      };
    }

    const key = request.headers.get("idempotency-key") ??
      createHash("sha256").update(JSON.stringify(body)).digest("hex");
    const store = getExecutionStore();
    const prior = await store.getIdempotencyResult<Record<string, unknown>>("fund-investment-learning", key);
    if (prior) return NextResponse.json(prior);
    if (!(await store.claimIdempotency("fund-investment-learning", key))) {
      return NextResponse.json({ error: "DUPLICATE_REQUEST_IN_PROGRESS" }, { status: 409 });
    }

    let response: Record<string, unknown>;
    if (learning) {
      await appendLearningCandidate(learning);
      response = { success: true, learning };
    } else {
      await appendLearningDecision(learningDecision!);
      response = { success: true, learningDecision };
    }
    await store.completeIdempotency("fund-investment-learning", key, response);
    return NextResponse.json(response);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Learningの保存に失敗しました";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
