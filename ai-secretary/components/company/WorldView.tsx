"use client";

/**
 * RPG World — Phase 6 §40 〜 §51
 *
 * §39 のとおり、AI社員の状態はBackendから受け取る。UI側で推測しない。
 * §50 のとおり、見た目はRPGだが数字は読みやすく出す。ゲームだけにしない。
 * §32 の判断を引き継ぎ、ゲームエンジンは入れずCSSとReactで作る。
 */

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { AlertTriangle, ShieldAlert } from "lucide-react";
import {
  AGENT_STATUS_LABELS,
  type AgentLiveStatus,
} from "@/app/lib/company/execution/agentStatus";
import {
  DEPARTMENT_GOAL_LABELS,
  type PersonalDepartmentGoal,
} from "@/app/lib/company/departmentGoals";
import { MissionExecutionPanel } from "./MissionExecutionPanel";
import { Skeleton } from "@/components/ui/primitives";

type World = {
  agents: AgentLiveStatus[];
  buildings: {
    goal: PersonalDepartmentGoal;
    agents: number;
    activeMissions: number;
    completedToday: number;
    revenueYen: number;
  }[];
  boardRoom: { pendingApprovals: Approval[] };
  securityCenter: {
    blockedActions: { id: string; actionType: string; reason?: string }[];
    r4Requests: unknown[];
    permissionViolations: unknown[];
    noExecutor?: unknown[];
    injectionAlerts?: unknown[];
    protectedCoreAttempts?: unknown[];
  };
  organizationCenter: {
    proposals: { id: string; type: string; title: string }[];
  };
  companyXp: number;
  ceoLocation: string;
  error?: string;
};

type Approval = {
  id: string;
  title: string;
  summary: string;
  riskLevel: string;
  requestedBy: string;
  missionId: string;
};

const BUILDING_EMOJI: Record<string, string> = {
  wealth: "🏦",
  income: "💰",
  media: "📣",
  business: "🧪",
  organization_evolution: "🏢",
  security: "🛡️",
};

const STATUS_STYLE: Record<string, string> = {
  IDLE: "bg-white/5 text-sub",
  THINKING: "bg-brand/10 text-brand",
  RESEARCHING: "bg-brand/10 text-brand",
  EXECUTING: "bg-gain/10 text-gain",
  REVIEWING: "bg-amber-500/10 text-amber-400",
  WAITING_APPROVAL: "bg-loss/10 text-loss",
  COMPLETE: "bg-gain/10 text-gain",
  ERROR: "bg-loss/10 text-loss",
};

const yen = (v: number) => `¥${Math.round(v).toLocaleString("ja-JP")}`;

export function WorldView() {
  const [selectedAgent, setSelectedAgent] = useState<string | null>(null);
  const [world, setWorld] = useState<World | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(() => {
    fetch("/api/company/world")
      .then((r) => r.json())
      .then((json: World) => setWorld(json))
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    load();
    window.addEventListener("company-execution-updated", load);
    return () => window.removeEventListener("company-execution-updated", load);
  }, [load]);

  const hasActiveAgent =
    world?.agents.some((a) =>
      ["THINKING", "EXECUTING", "REVIEWING"].includes(a.status),
    ) ?? false;
  useEffect(() => {
    if (!hasActiveAgent) return;
    const interval = window.setInterval(load, 3000);
    return () => window.clearInterval(interval);
  }, [hasActiveAgent, load]);

  const decide = useCallback(
    async (approval: Approval, decision: "approve" | "reject") => {
      let reason: string | undefined;
      if (decision === "reject") {
        const input = window.prompt(
          "却下する理由を入力してください（修正して再提出できます）",
        );
        if (!input?.trim()) return;
        reason = input.trim();
      }

      setBusy(approval.id);
      try {
        const res = await fetch(
          `/api/company/approvals/${approval.id}/${decision}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ reason }),
          },
        );
        const json = await res.json();
        if (!res.ok) window.alert(json.error ?? "処理に失敗しました");
        load();
      } finally {
        setBusy(null);
      }
    },
    [load],
  );

  if (!world) return <Skeleton className="h-72 rounded-2xl" />;
  if (world.error) return null;

  return (
    <div className="space-y-3">
      {/* ─── Board Room（§46） ─── */}
      <section className="rounded-2xl border border-hairline bg-ink-card p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <p className="text-sm font-semibold text-white">📊 Board Room</p>
        </div>

        {world.boardRoom.pendingApprovals.length === 0 ? (
          <p className="mt-2 text-[11px] text-sub">
            CEOの判断待ちはありません。
          </p>
        ) : (
          <ul className="mt-3 space-y-2">
            {world.boardRoom.pendingApprovals.map((approval) => (
              <li
                key={approval.id}
                className="rounded-xl border border-loss/25 bg-loss/[0.06] p-3"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="inline-flex items-center gap-1.5 text-[10px] font-semibold text-loss">
                      🔴 CEO DECISION
                      <span className="rounded-full border border-loss/30 px-1.5 py-0.5">
                        {approval.riskLevel}
                      </span>
                    </p>
                    <p className="mt-1 text-sm font-medium text-white">
                      {approval.title}
                    </p>
                    <p className="mt-0.5 text-[11px] leading-relaxed text-sub">
                      {approval.summary}
                    </p>
                    <p className="mt-1 text-[10px] text-sub">
                      依頼: {approval.requestedBy}
                    </p>
                  </div>
                  {/* モバイルでも押しやすい並びにしておく（§51） */}
                  <div className="flex w-full shrink-0 gap-2 sm:w-auto">
                    <button
                      type="button"
                      disabled={busy === approval.id}
                      onClick={() => decide(approval, "approve")}
                      className="flex-1 rounded-lg border border-gain/30 bg-gain/10 px-3 py-2 text-xs font-medium text-gain disabled:opacity-50 sm:flex-none"
                    >
                      承認
                    </button>
                    <button
                      type="button"
                      disabled={busy === approval.id}
                      onClick={() => decide(approval, "reject")}
                      className="flex-1 rounded-lg border border-loss/30 px-3 py-2 text-xs font-medium text-loss disabled:opacity-50 sm:flex-none"
                    >
                      却下
                    </button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* ─── World Map（§41 §42） ─── */}
      <section className="rounded-2xl border border-hairline bg-ink-card p-5">
        <p className="text-sm font-semibold text-white">オフィス</p>
        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
          {world.buildings.map((building) => (
            <div
              key={building.goal}
              className={`rounded-xl border p-3 ${
                building.activeMissions > 0
                  ? "border-brand/30 bg-brand/[0.06]"
                  : "border-hairline bg-white/[0.02]"
              }`}
            >
              <p className="text-xl" aria-hidden>
                {BUILDING_EMOJI[building.goal] ?? "🏠"}
              </p>
              <p className="mt-1 text-[11px] font-medium text-white">
                {DEPARTMENT_GOAL_LABELS[building.goal]}
              </p>
              <p className="mt-1 text-[10px] text-sub">
                AI社員 {building.agents}・進行中 {building.activeMissions}
              </p>
              {building.revenueYen > 0 && (
                <p className="text-[10px] text-gain">
                  {yen(building.revenueYen)}
                </p>
              )}
            </div>
          ))}
        </div>
      </section>

      <p className="text-xs text-sub">Game: Company XP {world.companyXp.toLocaleString("ja-JP")}</p>
      {/* ─── AI社員（§44） ─── */}
      <section className="rounded-2xl border border-hairline bg-ink-card p-5">
        <p className="text-sm font-semibold text-white">AI社員</p>
        <ul className="mt-3 space-y-2">
          {world.agents.map((agent) => (
            <li key={agent.agentId} className="flex items-center gap-3 text-xs">
              <span className="text-lg" aria-hidden>
                🧑‍💻
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium text-white">
                  <button
                    className="text-left hover:underline"
                    onClick={() =>
                      setSelectedAgent(
                        agent.agentId === selectedAgent ? null : agent.agentId,
                      )
                    }
                  >
                    {agent.name}
                  </button>
                  <span className="ml-1.5 text-[10px] font-normal text-sub">
                    Lv.{agent.level}
                  </span>
                </span>
                <span className="block truncate text-[10px] text-sub">
                  {agent.role}
                  {agent.currentMissionTitle
                    ? ` · ${agent.currentMissionTitle}`
                    : ""}
                </span>
              </span>
              <span className="shrink-0 text-right">
                <span
                  className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-medium ${
                    STATUS_STYLE[agent.status] ?? STATUS_STYLE.IDLE
                  }`}
                >
                  {AGENT_STATUS_LABELS[agent.status]}
                </span>
                {agent.attributedRevenueYen > 0 && (
                  <span className="mt-0.5 block text-[10px] text-gain">
                    {yen(agent.attributedRevenueYen)}
                  </span>
                )}
              </span>
            </li>
          ))}
        </ul>
      </section>

      <MissionExecutionPanel agentId={selectedAgent ?? undefined} />

      {/* ─── Security Center（§47） ─── */}
      <section className="rounded-2xl border border-hairline bg-ink-card p-5">
        <p className="inline-flex items-center gap-1.5 text-sm font-semibold text-white">
          <ShieldAlert className="h-4 w-4 text-sub" />
          Security Center
        </p>
        <p className="mt-2 text-xs text-sub">
          R4 {world.securityCenter.r4Requests.length} · Permission Denied{" "}
          {world.securityCenter.permissionViolations.length} · No Executor / DRY
          RUN {world.securityCenter.noExecutor?.length ?? 0} · Prompt Injection{" "}
          {world.securityCenter.injectionAlerts?.length ?? 0} · Protected Core{" "}
          {world.securityCenter.protectedCoreAttempts?.length ?? 0}
        </p>
        {world.securityCenter.blockedActions.length === 0 ? (
          <p className="mt-2 text-[11px] text-sub">
            ブロックされたActionはありません。
          </p>
        ) : (
          <ul className="mt-2 space-y-1.5">
            {world.securityCenter.blockedActions.slice(0, 5).map((action) => (
              <li
                key={action.id}
                className="flex items-start gap-1.5 rounded-lg bg-loss/[0.06] px-3 py-2 text-[11px] text-loss"
              >
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span>
                  {action.actionType}: {action.reason}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* ─── Organization Center（§48） ─── */}
      <section className="rounded-2xl border border-hairline bg-ink-card p-5">
        <div className="flex items-baseline justify-between">
          <p className="text-sm font-semibold text-white">
            🏢 Organization Center
          </p>
          <Link
            href="/company/organization"
            className="text-[11px] text-brand hover:underline"
          >
            詳しく見る
          </Link>
        </div>
        {world.organizationCenter.proposals.length === 0 ? (
          <p className="mt-2 text-[11px] text-sub">いま提案はありません。</p>
        ) : (
          <ul className="mt-2 space-y-1">
            {world.organizationCenter.proposals.slice(0, 5).map((proposal) => (
              <li key={proposal.id} className="text-[11px] text-sub">
                <span className="text-slate-300">{proposal.type}</span> ·{" "}
                {proposal.title}
              </li>
            ))}
          </ul>
        )}
        <p className="mt-2 text-[10px] text-sub">
          Learningは提案の根拠として蓄積します。組織やコードの自動変更は行いません。
        </p>
      </section>
    </div>
  );
}
