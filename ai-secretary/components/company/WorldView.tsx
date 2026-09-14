"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, Coffee, ShieldAlert } from "lucide-react";
import type { ExecutionState } from "@/app/lib/company/execution/store";
import type { DepartmentSummary } from "@/app/lib/company/organization";
import { AGENT_STATUS_LABELS, type AgentLiveStatus } from "@/app/lib/company/execution/agentStatus";
import {
  projectCurrentStep,
  projectMissionForUi,
  projectWaitReason,
  summarizeOffice,
  type SimpleUiStatus,
} from "@/app/lib/company/execution/uiProjection";
import { MissionExecutionPanel } from "./MissionExecutionPanel";
import { DepartmentPanel } from "./office/DepartmentPanel";
import { TaskBoard } from "./office/TaskBoard";
import type { AgentView, DepartmentView, TaskView } from "./office/types";
import { Skeleton } from "@/components/ui/primitives";

type Approval = { id: string; title: string; summary: string; riskLevel: string; requestedBy: string; missionId: string };
type World = {
  agents: AgentLiveStatus[];
  boardRoom: { pendingApprovals: Approval[] };
  securityCenter: {
    blockedActions: { id: string; actionType: string; reason?: string }[];
    r4Requests: unknown[];
    permissionViolations: unknown[];
  };
  error?: string;
};
type ExecutionSnapshot = { state: ExecutionState; error?: string };
type Organization = { departments: DepartmentSummary[]; error?: string };

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

export function WorldView() {
  const [world, setWorld] = useState<World>();
  const [execution, setExecution] = useState<ExecutionSnapshot>();
  const [organization, setOrganization] = useState<Organization>();
  const [busy, setBusy] = useState<string>();
  const [showExecutionDetails, setShowExecutionDetails] = useState(false);

  const load = useCallback(async () => {
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
    void load();
    window.addEventListener("company-execution-updated", load);
    return () => window.removeEventListener("company-execution-updated", load);
  }, [load]);

  const hasActiveAgent = world?.agents.some((agent) =>
    ["THINKING", "RESEARCHING", "EXECUTING", "REVIEWING"].includes(agent.status),
  ) ?? false;
  useEffect(() => {
    if (!hasActiveAgent) return;
    const interval = window.setInterval(() => void load(), 3000);
    return () => window.clearInterval(interval);
  }, [hasActiveAgent, load]);

  const decide = useCallback(async (approval: Approval, decision: "approve" | "reject") => {
    let reason: string | undefined;
    if (decision === "reject") {
      const input = window.prompt("却下理由を入力してください");
      if (!input?.trim()) return;
      reason = input.trim();
    }
    setBusy(approval.id);
    try {
      const response = await fetch(`/api/company/approvals/${approval.id}/${decision}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason }),
      });
      const data = await response.json();
      if (!response.ok) window.alert(data.error ?? "処理に失敗しました");
      await load();
    } finally {
      setBusy(undefined);
    }
  }, [load]);

  const view = useMemo(() => {
    if (!world || !execution || !organization) return undefined;
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

  if (!world || !execution || !organization) return <Skeleton className="h-96 rounded-2xl" />;
  if (world.error || execution.error || organization.error || !view) return null;

  return (
    <div className="space-y-4">
      <header className="rounded-2xl border border-hairline bg-ink-card px-5 py-4">
        <p className="text-xs font-medium uppercase tracking-[0.18em] text-brand">Simple Pixel Office</p>
        <div className="mt-1 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold text-white">Personal AI Company</h1>
            <p className="mt-1 text-xs text-sub">今、どの事業部の誰が、何をしているか</p>
          </div>
          <span className="inline-flex items-center gap-1.5 text-[11px] text-sub">
            <Coffee aria-hidden="true" className="h-3.5 w-3.5" /> Office online
          </span>
        </div>
        <dl className="mt-4 flex flex-wrap gap-2">
          <Stat label="稼働中" value={`${view.people.working} 人`} />
          <Stat label="待機" value={`${view.people.idle} 人`} />
          <Stat label="CEO確認" value={`${view.work.ceoReview} 件`} alert={view.work.ceoReview > 0} />
          <Stat label="問題" value={`${view.work.problem} 件`} danger={view.work.problem > 0} />
        </dl>
      </header>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
        <TaskBoard tasks={view.tasks} />
        <DepartmentPanel departments={view.departments} />
      </div>

      {world.boardRoom.pendingApprovals.length > 0 && (
        <section className="rounded-2xl border border-amber-400/30 bg-amber-400/[0.06] p-5">
          <h2 className="text-sm font-semibold text-amber-200">CEO確認待ち</h2>
          <ul className="mt-3 space-y-2">
            {world.boardRoom.pendingApprovals.map((approval) => (
              <li key={approval.id} className="rounded-xl border border-amber-400/20 p-3">
                <p className="text-sm font-medium text-white">{approval.title}</p>
                <p className="mt-1 text-[11px] text-sub">{approval.summary}</p>
                <div className="mt-3 flex gap-2">
                  <button type="button" disabled={busy === approval.id} onClick={() => void decide(approval, "approve")} className="rounded-lg border border-gain/30 bg-gain/10 px-3 py-2 text-xs text-gain disabled:opacity-50">承認</button>
                  <button type="button" disabled={busy === approval.id} onClick={() => void decide(approval, "reject")} className="rounded-lg border border-loss/30 px-3 py-2 text-xs text-loss disabled:opacity-50">却下</button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      <details
        className="rounded-2xl border border-hairline bg-ink-card p-4"
        onToggle={(event) => setShowExecutionDetails(event.currentTarget.open)}
      >
        <summary className="cursor-pointer text-sm font-medium text-white">Manual Missionの作成・実行詳細</summary>
        {showExecutionDetails ? <div className="mt-4"><MissionExecutionPanel /></div> : null}
      </details>

      <details className="rounded-xl border border-hairline bg-ink-card p-4">
        <summary className="inline-flex cursor-pointer items-center gap-2 text-xs text-sub"><ShieldAlert className="h-4 w-4" /> セキュリティ状況</summary>
        <p className="mt-3 text-xs text-sub">Block {world.securityCenter.blockedActions.length} · R4 {world.securityCenter.r4Requests.length} · Permission Denied {world.securityCenter.permissionViolations.length}</p>
        <ul className="mt-2 space-y-1.5">
          {world.securityCenter.blockedActions.slice(0, 5).map((action) => (
            <li key={action.id} className="flex gap-1.5 text-[11px] text-loss"><AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" /><span>{action.actionType}: {action.reason}</span></li>
          ))}
        </ul>
      </details>
    </div>
  );
}

function Stat({ label, value, alert, danger }: { label: string; value: string; alert?: boolean; danger?: boolean }) {
  const tone = danger
    ? "border-loss/40 bg-loss/10 text-loss"
    : alert
      ? "border-amber-400/40 bg-amber-400/10 text-amber-200"
      : "border-hairline bg-white/[0.03] text-slate-200";
  return (
    <div className={`flex items-baseline gap-1.5 rounded-lg border px-2.5 py-1.5 ${tone}`}>
      <dt className="text-[10px] uppercase tracking-wide opacity-70">{label}</dt>
      <dd className="text-xs font-semibold">{value}</dd>
    </div>
  );
}
