"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { ExecutionState } from "@/app/lib/company/execution/store";
import type { DepartmentSummary } from "@/app/lib/company/organization";
import { AGENT_STATUS_LABELS, type AgentLiveStatus } from "@/app/lib/company/execution/agentStatus";
import {
  projectCurrentStep,
  projectMissionForUi,
  projectWaitReason,
  summarizeOffice,
  type OfficeSummary,
  type SimpleUiStatus,
} from "@/app/lib/company/execution/uiProjection";
import type { AgentView, DepartmentView, TaskView } from "./types";

export type Approval = {
  id: string;
  title: string;
  summary: string;
  riskLevel: string;
  requestedBy: string;
  missionId: string;
};

export type World = {
  agents: AgentLiveStatus[];
  boardRoom: { pendingApprovals: Approval[] };
  securityCenter: {
    blockedActions: { id: string; actionType: string; reason?: string }[];
    r4Requests: unknown[];
    permissionViolations: unknown[];
  };
  error?: string;
};

export type ExecutionSnapshot = { state: ExecutionState; error?: string };
export type Organization = { departments: DepartmentSummary[]; error?: string };

export type CompanyOfficeView = {
  tasks: TaskView[];
  departments: DepartmentView[];
  /** 人軸の集計（稼働中 / 待機） */
  people: OfficeSummary;
  /** タスク軸の集計（CEO確認 / 問題） */
  work: OfficeSummary;
};

/** Current Stepは進行中のときだけ意味がある。完了や待機で出すと嘘になる。 */
const IN_FLIGHT: SimpleUiStatus[] = ["作業中", "レビュー中"];

/** 事業部の中では「今動いているAI社員」を先に見せる。 */
const AGENT_ORDER: Record<SimpleUiStatus, number> = {
  作業中: 0,
  レビュー中: 1,
  CEO確認待ち: 2,
  問題あり: 3,
  完了: 4,
  待機中: 5,
};

/**
 * Simple Pixel Office の表示データを1か所で組み立てる。
 *
 * ホームと /company が別々に投影すると、同じAI社員が画面ごとに違って見える。
 * §39 のとおり状態の出所はBackendのままで、ここは射影だけを持つ。
 */
export function useCompanyOffice() {
  const [world, setWorld] = useState<World>();
  const [execution, setExecution] = useState<ExecutionSnapshot>();
  const [organization, setOrganization] = useState<Organization>();

  const reload = useCallback(async () => {
    try {
      const [worldResponse, executionResponse, organizationResponse] = await Promise.all([
        fetch("/api/company/world"),
        fetch("/api/company/execution"),
        fetch("/api/company/organization"),
      ]);
      const [worldData, executionData, organizationData] = await Promise.all([
        worldResponse.json(),
        executionResponse.json(),
        organizationResponse.json(),
      ]);
      if (worldResponse.ok) setWorld(worldData);
      if (executionResponse.ok) setExecution(executionData);
      if (organizationResponse.ok) setOrganization(organizationData);
    } catch {
      // Keep existing data visible; a manual/event refresh retries.
    }
  }, []);

  useEffect(() => {
    void reload();
    window.addEventListener("company-execution-updated", reload);
    return () => window.removeEventListener("company-execution-updated", reload);
  }, [reload]);

  const hasActiveAgent = world?.agents.some((agent) =>
    ["THINKING", "RESEARCHING", "EXECUTING", "REVIEWING"].includes(agent.status),
  ) ?? false;
  useEffect(() => {
    if (!hasActiveAgent) return;
    const interval = window.setInterval(() => void reload(), 3000);
    return () => window.clearInterval(interval);
  }, [hasActiveAgent, reload]);

  const view = useMemo<CompanyOfficeView | undefined>(() => {
    if (!world || !execution || !organization) return undefined;
    if (world.error || execution.error || organization.error) return undefined;
    const state = execution.state;

    const agentById = new Map(world.agents.map((agent) => [agent.agentId, agent]));
    const missionById = new Map(state.missions.map((mission) => [mission.id, mission]));
    const departmentById = new Map(organization.departments.map((department) => [department.id, department]));

    /* 停止理由はBackendが記録したものだけを引く */
    const pendingApprovalTitleByMission = new Map(
      state.approvals
        .filter((approval) => approval.status === "PENDING")
        .map((approval) => [approval.missionId, approval.title]),
    );
    const blockedReasonByMission = new Map(
      state.actionRequests
        .filter((request) => request.status === "BLOCKED" && request.reason)
        .map((request) => [request.missionId, request.reason as string]),
    );

    const stepOfMission = (missionId: string) => {
      const mission = missionById.get(missionId);
      const plan = mission?.executionPlanId
        ? state.plans.find((candidate) => candidate.id === mission.executionPlanId)
        : state.plans.find((candidate) => candidate.missionId === missionId);
      return plan ? projectCurrentStep(plan.steps) : undefined;
    };

    const waitReasonOfMission = (missionId: string, status: SimpleUiStatus) => {
      const mission = missionById.get(missionId);
      return projectWaitReason({
        status,
        pendingApprovalTitle: pendingApprovalTitleByMission.get(missionId),
        blockedActionReason: blockedReasonByMission.get(missionId),
        cancelReason: mission?.cancelReason,
        lastTransitionReason: [...(mission?.history ?? [])].reverse().find((entry) => entry.reason)?.reason,
      });
    };

    const tasks: TaskView[] = [...state.missions]
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map((mission) => {
        const projected = projectMissionForUi(mission.status);
        const assignee = mission.assignedAgentId ? agentById.get(mission.assignedAgentId) : undefined;
        const department = assignee ? departmentById.get(assignee.departmentId) : undefined;
        return {
          missionId: mission.id,
          title: mission.title,
          description: mission.description,
          column: projected.column,
          status: projected.status,
          departmentName: department?.name,
          departmentIcon: department?.icon,
          assigneeName: assignee?.name,
          currentStep: IN_FLIGHT.includes(projected.status) ? stepOfMission(mission.id) : undefined,
          waitReason: waitReasonOfMission(mission.id, projected.status),
        };
      });

    const agents: AgentView[] = world.agents.map((agent) => {
      const status = AGENT_STATUS_LABELS[agent.status] as SimpleUiStatus;
      return {
        agentId: agent.agentId,
        name: agent.name,
        role: agent.role,
        status,
        currentMissionTitle: agent.currentMissionTitle,
        currentStep:
          agent.currentMissionId && IN_FLIGHT.includes(status) ? stepOfMission(agent.currentMissionId) : undefined,
        waitReason: agent.currentMissionId ? waitReasonOfMission(agent.currentMissionId, status) : undefined,
      };
    });

    const taskCountByDepartment = new Map<string, number>();
    for (const mission of state.missions) {
      const assignee = mission.assignedAgentId ? agentById.get(mission.assignedAgentId) : undefined;
      if (!assignee) continue;
      taskCountByDepartment.set(assignee.departmentId, (taskCountByDepartment.get(assignee.departmentId) ?? 0) + 1);
    }

    const agentViewById = new Map(agents.map((agent) => [agent.agentId, agent]));
    const departments: DepartmentView[] = organization.departments
      .map((department, index) => {
        const members = world.agents
          .filter((agent) => agent.departmentId === department.id)
          .map((agent) => agentViewById.get(agent.agentId))
          .filter((agent): agent is AgentView => Boolean(agent))
          .sort((a, b) => AGENT_ORDER[a.status] - AGENT_ORDER[b.status]);
        const counts = summarizeOffice(members.map((member) => member.status));
        return {
          id: department.id,
          name: department.name,
          icon: department.icon,
          agents: members,
          working: counts.working,
          idle: counts.idle,
          taskCount: taskCountByDepartment.get(department.id) ?? 0,
          index,
        };
      })
      /* 空の部署をトップ画面に並べない（v2方針） */
      .filter((department) => department.agents.length > 0 || department.taskCount > 0)
      .sort((a, b) => b.working - a.working || a.index - b.index)
      .map(({ index: _index, ...department }) => department);

    return {
      tasks,
      departments,
      people: summarizeOffice(agents.map((agent) => agent.status)),
      work: summarizeOffice(tasks.map((task) => task.status)),
    };
  }, [world, execution, organization]);

  return {
    world,
    execution,
    organization,
    view,
    loading: !world || !execution || !organization,
    reload,
  };
}
