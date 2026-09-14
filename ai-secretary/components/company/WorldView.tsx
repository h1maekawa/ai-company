"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, Coffee, Monitor, ShieldAlert } from "lucide-react";
import type { ExecutionState } from "@/app/lib/company/execution/store";
import { AGENT_STATUS_LABELS, type AgentLiveStatus } from "@/app/lib/company/execution/agentStatus";
import { TASK_BOARD_COLUMNS, projectMissionForUi, type SimpleUiStatus } from "@/app/lib/company/execution/uiProjection";
import { MissionExecutionPanel } from "./MissionExecutionPanel";
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

const STATUS_STYLE: Record<SimpleUiStatus, string> = {
  待機中: "border-slate-500/30 bg-white/5 text-sub",
  作業中: "border-sky-400/30 bg-sky-400/10 text-sky-300",
  レビュー中: "border-violet-400/30 bg-violet-400/10 text-violet-300",
  CEO確認待ち: "border-amber-400/40 bg-amber-400/10 text-amber-300",
  問題あり: "border-loss/40 bg-loss/10 text-loss",
  完了: "border-gain/30 bg-gain/10 text-gain",
};

function PixelEmployee({ working }: { working: boolean }) {
  return (
    <div aria-hidden="true" className="relative h-14 w-16 shrink-0 overflow-hidden rounded-lg border border-hairline bg-[#172238]" style={{ imageRendering: "pixelated" }}>
      <div className="absolute bottom-0 left-0 h-2 w-full bg-[#25334a]" />
      <div className="absolute left-3 top-2 h-3 w-3 bg-[#e3af83] shadow-[4px_0_0_#e3af83]" />
      <div className="absolute left-3 top-5 h-6 w-5 bg-[#526b91]" />
      <div className="absolute left-5 top-5 h-6 w-1 bg-[#dbeafe]" />
      <div className="absolute bottom-2 right-2 h-5 w-7 border-2 border-[#7d91ad] bg-[#0d1524]" />
      <div className={`absolute bottom-4 right-4 h-1.5 w-3 bg-sky-300 ${working ? "animate-pulse" : "opacity-40"}`} />
      <div className="absolute bottom-1 right-0 h-1 w-10 bg-[#9b6c45]" />
    </div>
  );
}

export function WorldView() {
  const [world, setWorld] = useState<World>();
  const [execution, setExecution] = useState<ExecutionSnapshot>();
  const [busy, setBusy] = useState<string>();
  const [showExecutionDetails, setShowExecutionDetails] = useState(false);

  const load = useCallback(async () => {
    try {
      const [worldResponse, executionResponse] = await Promise.all([
        fetch("/api/company/world"),
        fetch("/api/company/execution"),
      ]);
      const [worldData, executionData] = await Promise.all([worldResponse.json(), executionResponse.json()]);
      if (worldResponse.ok) setWorld(worldData);
      if (executionResponse.ok) setExecution(executionData);
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

  if (!world || !execution) return <Skeleton className="h-96 rounded-2xl" />;
  if (world.error || execution.error) return null;

  const agentById = new Map(world.agents.map((agent) => [agent.agentId, agent]));
  const missions = [...execution.state.missions].sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  return (
    <div className="space-y-4">
      <header className="rounded-2xl border border-hairline bg-ink-card px-5 py-4">
        <p className="text-xs font-medium uppercase tracking-[0.18em] text-brand">Simple Pixel Office</p>
        <div className="mt-1 flex flex-wrap items-end justify-between gap-2">
          <div>
            <h1 className="text-xl font-semibold text-white">AI Company Office</h1>
            <p className="mt-1 text-xs text-sub">今、誰が、何をしているか</p>
          </div>
          <span className="inline-flex items-center gap-1.5 text-[11px] text-sub"><Coffee className="h-3.5 w-3.5" /> Office online</span>
        </div>
      </header>

      <section aria-labelledby="task-board-heading">
        <div className="mb-2 flex items-center justify-between">
          <h2 id="task-board-heading" className="text-sm font-semibold text-white">Task Board</h2>
          <span className="text-[11px] text-sub">Missionから自動表示</span>
        </div>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {TASK_BOARD_COLUMNS.map((column) => {
            const tasks = missions.filter((mission) => projectMissionForUi(mission.status).column === column.id);
            const visibleTasks = column.id === "done" ? tasks.slice(0, 6) : tasks;
            return (
              <div key={column.id} className="min-h-40 rounded-xl border border-hairline bg-ink-card p-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-semibold text-white">{column.label}</h3>
                  <span className="rounded-full bg-white/5 px-2 py-0.5 text-[10px] text-sub">{tasks.length}</span>
                </div>
                <ul className="mt-3 space-y-2">
                  {visibleTasks.map((mission) => {
                    const projected = projectMissionForUi(mission.status);
                    const assignee = mission.assignedAgentId ? agentById.get(mission.assignedAgentId) : undefined;
                    return (
                      <li key={mission.id} className="rounded-lg border border-hairline bg-white/[0.025] p-3">
                        <p className="line-clamp-2 text-xs font-medium leading-relaxed text-white">{mission.title}</p>
                        <p className="mt-2 truncate text-[10px] text-sub">担当: {assignee?.name ?? "未割当"}</p>
                        <span className={`mt-2 inline-flex rounded-full border px-2 py-0.5 text-[10px] ${STATUS_STYLE[projected.status]}`}>{projected.status}</span>
                      </li>
                    );
                  })}
                </ul>
                {visibleTasks.length === 0 && <p className="mt-8 text-center text-[11px] text-sub">タスクなし</p>}
              </div>
            );
          })}
        </div>
      </section>

      <section aria-labelledby="employees-heading" className="rounded-2xl border border-hairline bg-ink-card p-5">
        <div className="flex items-center justify-between">
          <h2 id="employees-heading" className="text-sm font-semibold text-white">AI Employees</h2>
          <span className="inline-flex items-center gap-1 text-[11px] text-sub"><Monitor className="h-3.5 w-3.5" /> {world.agents.length} employees</span>
        </div>
        <ul className="mt-4 grid gap-3 md:grid-cols-2">
          {world.agents.map((agent) => {
            const label = AGENT_STATUS_LABELS[agent.status] as SimpleUiStatus;
            const working = ["THINKING", "RESEARCHING", "EXECUTING"].includes(agent.status);
            return (
              <li key={agent.agentId} className="flex gap-3 rounded-xl border border-hairline bg-white/[0.025] p-3">
                <PixelEmployee working={working} />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center justify-between gap-1">
                    <p className="truncate text-sm font-medium text-white">{agent.name}</p>
                    <span className={`rounded-full border px-2 py-0.5 text-[10px] ${STATUS_STYLE[label]}`}>{label}</span>
                  </div>
                  <p className="mt-0.5 truncate text-[11px] text-sub">{agent.role}</p>
                  <p className="mt-2 line-clamp-2 text-[11px] leading-relaxed text-slate-300"><span className="text-sub">Current Mission: </span>{agent.currentMissionTitle ?? "なし"}</p>
                </div>
              </li>
            );
          })}
        </ul>
      </section>

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
