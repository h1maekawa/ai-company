import { NextRequest, NextResponse } from "next/server";
import { DEPARTMENT_IDS, DEPARTMENT_NAV_BY_ID, type NavigationDepartmentId } from "@/app/lib/config/navigation";
import { findSecretary } from "@/app/lib/config/registry";
import { getSkillsForSecretary } from "@/app/lib/skills/registry";
import { computeAgentStatuses } from "@/app/lib/company/execution/agentStatus";
import { loadExecutionState } from "@/app/lib/company/execution/store";
import { buildOrganizationSnapshot } from "@/app/lib/company/organization";
import { skillEffectiveness } from "@/app/lib/company/evolution/skillObservability";

export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  if (!DEPARTMENT_IDS.includes(params.id as NavigationDepartmentId)) return NextResponse.json({ error: "UNKNOWN_DEPARTMENT" }, { status: 404 });
  const department = DEPARTMENT_NAV_BY_ID[params.id as NavigationDepartmentId];
  const entries = department.employeeIds.map(findSecretary).filter(Boolean);
  const state = await loadExecutionState().catch(() => null);
  const employeeIds = new Set(entries.map((entry) => entry!.config.id));
  const agents = buildOrganizationSnapshot().agents.filter((agent) => employeeIds.has(agent.id));
  const statuses = state ? computeAgentStatuses({ agents, missions: state.missions, actionRequests: state.actionRequests, approvals: state.approvals }) : [];
  return NextResponse.json({
    employees: entries.map((entry) => {
      const live = statuses.find((status) => status.agentId === entry!.config.id);
      const currentStep = state?.plans.flatMap((plan) => plan.steps.map((step) => ({ plan, step }))).find(({ step }) => step.assignedAgentId === entry!.config.id && ["RUNNING", "WAITING", "BLOCKED"].includes(step.status));
      const stepMission = currentStep ? state?.missions.find((mission) => mission.id === currentStep.plan.missionId) : undefined;
      const researchRuns = (state?.runtime?.researchRuns ?? []).filter((run) => run.researcherAgentId === entry!.config.id);
      const latestResearch = researchRuns.at(-1);
      const researchItems = (state?.runtime?.researchItems ?? []).filter((item) => item.researcherAgentId === entry!.config.id);
      return {
        id: entry!.config.id,
        name: entry!.config.name,
        role: entry!.config.role,
        departmentRole: entry!.config.departmentRole ?? (entry!.config.kind === "manager" ? "lead" : "specialist"),
        knowledgeAccess: entry!.config.knowledgeAccess ?? { mode: "read", domains: [] },
        permissions: agents.find((agent) => agent.id === entry!.config.id)?.granted ?? [],
        departmentId: department.id,
        riskLevel: entry!.config.riskLevel,
        status: currentStep?.step.status === "RUNNING" ? "EXECUTING" : currentStep?.step.status === "WAITING" ? "WAITING_APPROVAL" : currentStep?.step.status === "BLOCKED" ? "ERROR" : live?.status ?? "UNKNOWN",
        currentMissionId: stepMission?.id ?? live?.currentMissionId,
        currentMissionTitle: stepMission?.title ?? live?.currentMissionTitle,
        currentStep: currentStep ? { id: currentStep.step.id, title: currentStep.step.title, status: currentStep.step.status, dependsOn: currentStep.step.dependsOn ?? [], outputRefs: currentStep.step.outputRefs ?? [] } : undefined,
        research: latestResearch ? { lastRun: latestResearch.completedAt ?? latestResearch.startedAt, freshItems: researchItems.filter((item) => item.freshnessStatus === "FRESH").length, importantItems: researchItems.filter((item) => item.reliability === "PRIMARY" || item.reliability === "HIGH").length, health: latestResearch.status === "COMPLETED" ? "HEALTHY" : latestResearch.status } : undefined,
        skills: getSkillsForSecretary(entry!.config.id).map((skill) => ({ id: skill.id, name: skill.name, status: skill.status, category: skill.category, usage: state ? skillEffectiveness(skill.id, state.runtime?.skillExecutions ?? [], state.missions) : skillEffectiveness(skill.id, null) })),
      };
    }),
  });
}
