import { NextResponse } from "next/server";
import { buildOrganizationSnapshot } from "@/app/lib/company/organization";
import { loadExecutionState } from "@/app/lib/company/execution/store";
import { applyExpiry } from "@/app/lib/company/execution/approval";
import { computeAgentStatuses } from "@/app/lib/company/execution/agentStatus";
import { summarizeContributions } from "@/app/lib/company/execution/contribution";
import { computeCompanyXp, type XpEvent } from "@/app/lib/company/execution/xp";
import { effectiveEntries, loadRevenueEntries } from "@/app/lib/company/revenueStore";
import { loadProposals } from "@/app/lib/company/evolution/store";
import { DEPARTMENT_GOAL_MAP } from "@/app/lib/company/departmentGoals";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * GET /api/company/world — RPG World の状態（Phase 6 §38 §39 §41 §42）
 *
 * AI社員の状態はここで計算する。UI側で推測させない。
 */
export async function GET(): Promise<NextResponse> {
  try {
    const [state, revenue, proposals] = await Promise.all([
      loadExecutionState(),
      loadRevenueEntries().catch(() => []),
      loadProposals().catch(() => []),
    ]);

    const organization = buildOrganizationSnapshot();
    const approvals = applyExpiry(state.approvals);
    const confirmed = effectiveEntries(revenue).filter(
      (e) => e.confirmedByHuman && e.sourceType !== "investment"
    );
    const contributions = summarizeContributions(confirmed);

    const agents = computeAgentStatuses({
      agents: organization.agents,
      missions: state.missions,
      actionRequests: state.actionRequests,
      approvals,
      revenueByAgent: contributions.byAgent,
    });

    /* Company XP（Game Layer。Healthには入れない・§66） */
    const xpEvents: XpEvent[] = [
      ...state.missions
        .filter((m) => m.status === "COMPLETED")
        .map((m) => ({ type: "MISSION_COMPLETE" as const, at: m.completedAt ?? m.createdAt })),
      ...confirmed.map((e) => ({
        type: "REVENUE_EARNED" as const,
        at: e.occurredAt,
        amountYen: e.amountYen,
      })),
      ...(contributions.totalRevenueYen > 0
        ? [{ type: "FIRST_REVENUE" as const, at: confirmed[0]?.occurredAt ?? "" }]
        : []),
    ];

    /* 建物ごとの状況（§42） */
    const buildings = DEPARTMENT_GOAL_MAP.map((goal) => {
      const members = agents.filter((a) => goal.agentIds.includes(a.agentId));
      return {
        goal: goal.goal,
        agents: members.length,
        activeMissions: members.reduce((sum, a) => sum + a.activeMissions, 0),
        completedToday: members.reduce((sum, a) => sum + a.completedMissions, 0),
        revenueYen: members.reduce((sum, a) => sum + a.attributedRevenueYen, 0),
        alerts: 0,
      };
    });

    const pendingApprovals = approvals.filter((a) => a.status === "PENDING");
    const blockedActions = state.actionRequests.filter((a) => a.status === "BLOCKED");

    return NextResponse.json({
      agents,
      buildings,
      boardRoom: { pendingApprovals },
      securityCenter: {
        blockedActions,
        r4Requests: state.actionRequests.filter((a) => a.riskLevel === "R4"),
        permissionViolations: blockedActions.filter((a) => a.reason?.includes("権限")),
      },
      organizationCenter: {
        proposals: proposals.filter(
          (p) => p.status === "PROPOSED" || p.status === "HIGH_PRIORITY"
        ),
      },
      companyXp: computeCompanyXp(xpEvents),
      revenueContribution: contributions,
      /** CEOアバターの居場所。重要イベントに応じて変える（§43） */
      ceoLocation:
        pendingApprovals.length > 0
          ? "board"
          : blockedActions.length > 0
            ? "security"
            : "ceo_office",
    });
  } catch (error) {
    console.error("[api/company/world] 失敗:", error);
    return NextResponse.json({ error: "ワールド状態の取得に失敗しました" }, { status: 500 });
  }
}
