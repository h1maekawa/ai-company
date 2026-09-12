import { NextResponse } from "next/server";
import { PERSONAL_COMPANY } from "@/app/lib/company/personalCompany";
import { buildOrganizationSnapshot } from "@/app/lib/company/organization";
import { runDailyPersonalCompanyReview } from "@/app/lib/company/reviews/reviews";
import { loadProposals } from "@/app/lib/company/evolution/store";
import { DEPARTMENT_GOAL_MAP } from "@/app/lib/company/departmentGoals";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * GET /api/company/dashboard — CEO向けの読み取りAPI（Phase 4 §27）
 *
 * 読み取りのみ。レビューは実行するが保存しない（保存はcronの仕事）。
 * 表示側が「0円」と「未設定」を区別できるよう、
 * KPIは値そのものではなく availability 付きで返す。
 */
export async function GET(): Promise<NextResponse> {
  try {
    const [review, proposals] = await Promise.all([
      runDailyPersonalCompanyReview(),
      loadProposals().catch(() => []),
    ]);
    const organization = buildOrganizationSnapshot();

    const visibleProposals = proposals.filter(
      (p) => p.status === "PROPOSED" || p.status === "HIGH_PRIORITY"
    );

    return NextResponse.json({
      company: PERSONAL_COMPANY,
      level: review.level,
      primaryGoal: {
        id: PERSONAL_COMPANY.currentGoal,
        title: "FIRST REVENUE",
        currentYen: review.firstRevenueProgress.currentYen,
        targetYen: review.firstRevenueProgress.targetYen,
      },
      metrics: review.metrics,
      fire: review.fire,
      companyHealth: review.companyHealth,
      departmentGoals: DEPARTMENT_GOAL_MAP,
      organization: {
        departments: organization.departments,
        agents: organization.totals.agents,
        workflows: organization.totals.workflows,
      },
      today: {
        tasks: review.tasks,
        ceoInterventions: review.ceoInterventions,
        organizationStatus: review.organizationStatus,
      },
      mission: review.mission,
      revenueMode: review.revenueMode,
      revenue: {
        aiGeneratedYen: review.firstRevenueProgress.currentYen,
        newTodayYen: review.newRevenueYen,
        bySource: review.revenueBySource,
      },
      proposals: {
        total: proposals.length,
        visible: visibleProposals.length,
        byType: visibleProposals.reduce<Record<string, number>>((acc, p) => {
          acc[p.type] = (acc[p.type] ?? 0) + 1;
          return acc;
        }, {}),
        items: visibleProposals.slice(0, 10),
      },
      achievements: review.achievements,
    });
  } catch (error) {
    console.error("[api/company/dashboard] 失敗:", error);
    return NextResponse.json({ error: "ダッシュボードの取得に失敗しました" }, { status: 500 });
  }
}
