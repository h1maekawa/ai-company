import { NextRequest, NextResponse } from "next/server";
import { verifyCronSecret } from "@/app/lib/integrations/machine-auth";
import { executionTransaction } from "@/app/lib/company/execution/transaction";
import { loadExecutionState, saveExecutionState } from "@/app/lib/company/execution/store";
import { DEPARTMENT_RESEARCH_POLICIES } from "@/app/lib/company/research/policies";
import { availableResearchProviders } from "@/app/lib/company/research/providers";
import { retainResearchArtifacts, runDepartmentResearch } from "@/app/lib/company/research/platform";
import { researchEligible } from "@/app/lib/company/research/scheduler";
import { appendOperationalEvent, discoverCompanyImprovementCandidates, operationalEvent } from "@/app/lib/company/evolution/operationalObservability";
import { loadExperiences, loadGrowthReviews, loadNoteQueue, loadPerformance, loadSocialDrafts } from "@/app/lib/note/research/store";
import { buildCreatorDailyResearchAgenda } from "@/app/lib/note/automation/dailyResearchAgenda";
import { tokyoDateKey } from "@/app/lib/note/tokyoDate";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const auth = verifyCronSecret(req);
  if (!auth.ok) return NextResponse.json({ error: auth.reason }, { status: 401 });
  const now = new Date();
  const [performance, drafts, experiences, growthReviews, noteQueue] = await Promise.all([
    loadPerformance(), loadSocialDrafts(), loadExperiences(), loadGrowthReviews(), loadNoteQueue(),
  ]);
  const summaries: unknown[] = [];
  await executionTransaction(async () => {
    const state = await loadExecutionState();
    const runtime = state.runtime ?? { runs: {}, executions: [], artifacts: [], learning: [] };
    let items = runtime.researchItems ?? [];
    let artifacts = runtime.researchArtifacts ?? [];
    let runs = runtime.researchRuns ?? [];
    let events = runtime.operationalEvents ?? [];
    const providers = await availableResearchProviders(state);
    for (const policy of DEPARTMENT_RESEARCH_POLICIES) {
      if (!researchEligible(policy, runs)) continue;
      const agenda = policy.departmentId === "creator"
        ? buildCreatorDailyResearchAgenda({
            date: tokyoDateKey(now), now, policy,
            recentResearch: items.filter((item) => item.departmentIds.includes("creator")),
            researchArtifacts: artifacts.filter((artifact) => artifact.departmentContexts.creator),
            recentPosts: drafts.slice(-30),
            performance: performance.records.slice(-100),
            nightlyReviewRefs: growthReviews.slice(-3).map((review) => `growth-review:${review.date}`),
            winningTopicRefs: growthReviews.slice(-3).flatMap((review) => review.winningTopics.map((topic) => topic.topicId)),
            weakTopicRefs: growthReviews.slice(-3).flatMap((review) => review.decliningTopics.map((topic) => topic.topicId)),
            recentlyUsedTopics: drafts.slice(-30).flatMap((draft) => draft.trendClusterId ? [draft.trendClusterId] : []),
            experiences,
            noteCandidateRefs: noteQueue.articles.filter((article) => article.status !== "published").slice(0, 5).map((article) => article.id),
          })
        : undefined;
      const result = await runDepartmentResearch({ policy, providers, existingItems: items, agenda });
      items = result.items;
      artifacts = retainResearchArtifacts([...artifacts, ...result.artifacts]);
      runs = [...runs, result.run].slice(-500);
      for (const provider of result.run.failedSources) {
        events = appendOperationalEvent(events, operationalEvent({
          type: "RESEARCH_PROVIDER_FAILURE", departmentId: policy.departmentId,
          agentId: policy.researcherAgentId, metadata: { provider, errorCode: "PROVIDER_FAILURE" },
        }));
      }
      summaries.push(result.run);
    }
    const candidates = discoverCompanyImprovementCandidates(events, runtime.companyImprovementCandidates ?? []);
    await saveExecutionState({ ...state, runtime: { ...runtime, researchItems: items, researchArtifacts: artifacts, researchRuns: runs, operationalEvents: events, companyImprovementCandidates: candidates } });
  });
  return NextResponse.json({ runs: summaries });
}
