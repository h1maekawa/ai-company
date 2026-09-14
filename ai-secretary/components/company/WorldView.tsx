"use client";

import { useCallback, useState } from "react";
import { AlertTriangle, ShieldAlert } from "lucide-react";
import { AGENT_STATUS_LABELS } from "@/app/lib/company/execution/agentStatus";
import { MissionExecutionPanel } from "./MissionExecutionPanel";
import { CompanyOfficeOverview } from "./office/CompanyOfficeOverview";
import { useCompanyOffice, type Approval } from "./office/useCompanyOffice";

/**
 * /company — 会社の現在地に、承認と実行詳細を足した画面。
 *
 * 会社の見え方そのものは CompanyOfficeOverview に持たせ、ホームと共有する。
 * AI社員の状態はBackendで計算する（§39）。組み立ては useCompanyOffice。
 */
export function WorldView() {
  const { world, view, loading, reload } = useCompanyOffice();
  const [busy, setBusy] = useState<string>();
  const [showExecutionDetails, setShowExecutionDetails] = useState(false);

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
      await reload();
    } finally {
      setBusy(undefined);
    }
  }, [reload]);

  if (loading) return <CompanyOfficeOverview view={undefined} title="Personal AI Company" subtitle="" />;
  if (!world || !view) return null;

  /* 承認は「誰が出したのか」まで見えないと判断できない。状態のラベルはBackend由来（§39） */
  const agentById = new Map(world.agents.map((agent) => [agent.agentId, agent]));

  return (
    <div className="space-y-4">
      <CompanyOfficeOverview
        view={view}
        title="Personal AI Company"
        subtitle="今、どの事業部の誰が、何をしているか"
      />

      {world.boardRoom.pendingApprovals.length > 0 && (
        <section className="rounded-2xl border border-amber-400/30 bg-amber-400/[0.06] p-5">
          <h2 className="text-sm font-semibold text-amber-200">CEO確認待ち</h2>
          <ul className="mt-3 space-y-2">
            {world.boardRoom.pendingApprovals.map((approval) => {
              const requester = agentById.get(approval.requestedBy);
              return (
              <li key={approval.id} className="rounded-xl border border-amber-400/20 p-3">
                <p className="text-sm font-medium text-white">{approval.title}</p>
                <p className="mt-1 text-[11px] text-sub">{approval.summary}</p>
                {requester && (
                  <p className="mt-1.5 text-[10px] text-sub">
                    依頼: {requester.name} · {AGENT_STATUS_LABELS[requester.status]}
                  </p>
                )}
                <div className="mt-3 flex gap-2">
                  <button type="button" disabled={busy === approval.id} onClick={() => void decide(approval, "approve")} className="rounded-lg border border-gain/30 bg-gain/10 px-3 py-2 text-xs text-gain disabled:opacity-50">承認</button>
                  <button type="button" disabled={busy === approval.id} onClick={() => void decide(approval, "reject")} className="rounded-lg border border-loss/30 px-3 py-2 text-xs text-loss disabled:opacity-50">却下</button>
                </div>
              </li>
              );
            })}
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
