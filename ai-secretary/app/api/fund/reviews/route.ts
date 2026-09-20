import { NextResponse } from "next/server";
import { loadDecisions, loadRecommendations } from "@/app/lib/fund/store";
import { buildInvestmentDecisionReviews } from "@/app/lib/fund/learning/engine";
import {
  effectiveInvestmentLearnings,
  loadDecisionOutcomes,
  loadLearningCandidates,
  loadLearningDecisions,
} from "@/app/lib/fund/learning/store";

export const dynamic = "force-dynamic";

/** Recommendation / Human Fact / Outcome / AI Learning Candidateのread model。 */
export async function GET(): Promise<NextResponse> {
  try {
    const [decisions, recommendations, outcomes, candidates, learningDecisions] = await Promise.all([
      loadDecisions(), loadRecommendations(), loadDecisionOutcomes(), loadLearningCandidates(), loadLearningDecisions(),
    ]);
    const learnings = effectiveInvestmentLearnings(candidates, learningDecisions);
    const reviews = buildInvestmentDecisionReviews({ recommendations, decisions, outcomes, learnings });
    return NextResponse.json({
      success: true,
      reviews,
      counts: {
        decisions: decisions.length,
        recommendations: recommendations.length,
        outcomes: outcomes.length,
        learningCandidates: candidates.length,
        approvedLearnings: learnings.filter((item) => item.status === "approved").length,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
