import { NextRequest, NextResponse } from "next/server";
import { DEPARTMENT_IDS, DEPARTMENT_NAV_BY_ID, type NavigationDepartmentId } from "@/app/lib/config/navigation";
import { findSecretary } from "@/app/lib/config/registry";
import { getSkillsForSecretary } from "@/app/lib/skills/registry";
import { computeAgentStatuses } from "@/app/lib/company/execution/agentStatus";
import { loadExecutionState } from "@/app/lib/company/execution/store";
import { buildOrganizationSnapshot } from "@/app/lib/company/organization";

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
      return {
        id: entry!.config.id,
        name: entry!.config.name,
        role: entry!.config.role,
        departmentRole: entry!.config.departmentRole ?? (entry!.config.kind === "manager" ? "lead" : "specialist"),
        knowledgeAccess: entry!.config.knowledgeAccess ?? { mode: "read", domains: [] },
        permissions: agents.find((agent) => agent.id === entry!.config.id)?.granted ?? [],
        departmentId: department.id,
        riskLevel: entry!.config.riskLevel,
        status: live?.status ?? "UNKNOWN",
        currentMissionId: live?.currentMissionId,
        currentMissionTitle: live?.currentMissionTitle,
        skills: getSkillsForSecretary(entry!.config.id).map((skill) => ({ id: skill.id, name: skill.name, status: skill.status, category: skill.category })),
      };
    }),
  });
}
