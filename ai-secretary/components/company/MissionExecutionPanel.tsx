"use client";
import { useCallback, useEffect, useState } from "react";
import type { ExecutionState } from "@/app/lib/company/execution/store";
import type { RevenueOpportunity } from "@/app/lib/company/opportunity/types";
import type { RevenueEntry } from "@/app/lib/company/revenueStore";
import type { agentPerformance } from "@/app/lib/company/execution/performance";
type Snapshot = {
  state: ExecutionState;
  opportunities: RevenueOpportunity[];
  revenue: RevenueEntry[];
  performance: ReturnType<typeof agentPerformance>;
  runtime: {
    schemaVersion: string;
    deployment: { commitSha?: string; environment: string; authority: string; runtimeVersion: string };
    environment: { realModelCanaryEnabled: boolean };
    store: string;
    storeVersion: number;
    activeMissions: number;
    activeLeases: number;
    pendingApprovals: number;
    attention: Array<{ id: string; priority: string; title: string; summary: string }>;
    recentFailures: Array<{ id: string; type: string; detail?: string }>;
  };
};
export function MissionExecutionPanel({ agentId }: { agentId?: string }) {
  const [snapshot, setSnapshot] = useState<Snapshot>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [manualTitle, setManualTitle] = useState("");
  const [manualDescription, setManualDescription] = useState("");
  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/company/execution");
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      setSnapshot(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "取得失敗");
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  const act = async (url: string) => {
    setBusy(true);
    setError("");
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: { "idempotency-key": crypto.randomUUID() },
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      await load();
      window.dispatchEvent(new Event("company-execution-updated"));
    } catch (e) {
      setError(e instanceof Error ? e.message : "実行失敗");
    } finally {
      setBusy(false);
    }
  };
  const createManual = async () => {
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/company/missions/manual", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "idempotency-key": crypto.randomUUID(),
        },
        body: JSON.stringify({ title: manualTitle, description: manualDescription }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      setManualTitle("");
      setManualDescription("");
      await load();
      window.dispatchEvent(new Event("company-execution-updated"));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Mission作成失敗");
    } finally {
      setBusy(false);
    }
  };
  const button =
    "rounded border border-hairline px-3 py-1 text-xs text-brand disabled:opacity-40";
  const missions =
    snapshot?.state.missions.filter(
      (m) => !agentId || m.assignedAgentId === agentId,
    ) ?? [];
  return (
    <section className="space-y-3 rounded-2xl border border-hairline bg-ink-card p-5">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-white">
          Mission実行・Activity Log
        </h2>
        <button className={button} disabled={busy} onClick={() => void load()}>
          更新
        </button>
      </div>
      <p className="text-xs text-sub">
        Runで許可された内部作業を進めます。承認が必要な場合は停止します。外部への送信・公開は行いません。
      </p>
      {!agentId && (
        <form
          className="space-y-3 rounded-xl border border-hairline p-4"
          onSubmit={(event) => {
            event.preventDefault();
            void createManual();
          }}
        >
          <div>
            <h3 className="text-sm font-semibold text-white">CEO Manual Mission</h3>
            <p className="mt-1 text-xs text-sub">
              CEOが内部作業を登録します。作成だけではAIを実行しません。
            </p>
          </div>
          <label className="block text-xs text-sub">
            Mission title
            <input
              className="mt-1 w-full rounded border border-hairline bg-ink-base px-3 py-2 text-white"
              maxLength={120}
              required
              value={manualTitle}
              onChange={(event) => setManualTitle(event.target.value)}
            />
          </label>
          <label className="block text-xs text-sub">
            Objective / Description
            <textarea
              className="mt-1 min-h-24 w-full rounded border border-hairline bg-ink-base px-3 py-2 text-white"
              maxLength={2000}
              required
              value={manualDescription}
              onChange={(event) => setManualDescription(event.target.value)}
            />
          </label>
          <button
            className={button}
            disabled={busy || !manualTitle.trim() || !manualDescription.trim()}
            type="submit"
          >
            {busy ? "処理中…" : "Missionを作成"}
          </button>
        </form>
      )}
      {snapshot?.runtime && (
        <div className="grid grid-cols-2 gap-2 rounded-lg border border-hairline p-3 text-xs text-sub md:grid-cols-4">
          <span>Production: Vercel / Cloudflare Secondary</span>
          <span>Environment: {snapshot.runtime.deployment.environment}</span>
          <span>Commit: {snapshot.runtime.deployment.commitSha?.slice(0, 7) ?? "local"}</span>
          <span>Runtime: {snapshot.runtime.deployment.runtimeVersion} / {snapshot.runtime.schemaVersion}</span>
          <span>Store: {snapshot.runtime.store} v{snapshot.runtime.storeVersion}</span>
          <span>Active: {snapshot.runtime.activeMissions}</span>
          <span>Leases: {snapshot.runtime.activeLeases}</span>
          <span>Approvals: {snapshot.runtime.pendingApprovals}</span>
          <span>Attention: {snapshot.runtime.attention.length}</span>
          <span>Canary: {snapshot.runtime.environment.realModelCanaryEnabled ? "enabled" : "disabled"}</span>
        </div>
      )}
      {snapshot?.runtime.attention.map((item) => (
        <p key={item.id} className="rounded border border-loss/40 p-2 text-xs text-loss">
          {item.priority.toUpperCase()}: {item.title} — {item.summary}
        </p>
      ))}
      {error && (
        <p role="alert" className="text-xs text-loss">
          {error}
        </p>
      )}
      {!snapshot && !error && <p className="text-xs text-sub">読み込み中…</p>}
      {agentId &&
        snapshot?.performance
          .filter((p) => p.agentId === agentId)
          .map((p) => (
            <p key={p.agentId} className="text-xs text-sub">
              現在のWorkload{" "}
              {
                missions.filter((m) =>
                  [
                    "ACTIVE",
                    "EXECUTING",
                    "REVIEWING",
                    "WAITING_APPROVAL",
                  ].includes(m.status),
                ).length
              }
              件 · 担当 {p.assignedMissions} / 完了 {p.completedMissions} / 失敗{" "}
              {p.failedMissions} / Block {p.blockedMissions} · Review Pass{" "}
              {p.reviewPassRate === null
                ? "未計測"
                : `${Math.round(p.reviewPassRate * 100)}%`}{" "}
              · 平均時間{" "}
              {p.averageLatencyMs === null
                ? "未計測"
                : `${Math.round(p.averageLatencyMs)}ms`}{" "}
              · 収益貢献 ¥{p.attributedRevenueYen.toLocaleString("ja-JP")}
            </p>
          ))}
      {!agentId &&
        snapshot?.opportunities
          .filter((o) => o.status === "RECOMMENDED")
          .map((o) => (
            <div
              key={o.id}
              className="flex items-center justify-between gap-2 text-xs text-sub"
            >
              <span>{o.title}</span>
              <button
                disabled={busy}
                className={button}
                onClick={() =>
                  void act(
                    `/api/company/opportunities/${encodeURIComponent(o.id)}/select`,
                  )
                }
              >
                選択
              </button>
            </div>
          ))}
      {snapshot && missions.length === 0 && (
        <p className="text-xs text-sub">Mission履歴はありません。</p>
      )}
      {missions.map((mission) => {
        const plan = snapshot?.state.plans.find(
          (p) => p.id === mission.executionPlanId,
        );
        const run = snapshot?.state.runtime?.runs[mission.id];
        const actions =
          snapshot?.state.actionRequests.filter(
            (a) => a.missionId === mission.id,
          ) ?? [];
        const revenue =
          snapshot?.revenue.filter((e) => e.missionId === mission.id) ?? [];
        return (
          <details
            key={mission.id}
            className="rounded-lg border border-hairline p-3 text-xs text-sub"
          >
            <summary className="cursor-pointer text-white">
              {mission.title} · {mission.status}
            </summary>
            <div className="mt-3 space-y-3">
              <p>
                Opportunity:{" "}
                {snapshot?.opportunities.find(
                  (o) => o.id === mission.opportunityId,
                )?.title ??
                  mission.opportunityId ??
                  "なし"}{" "}
                · 担当: {mission.assignedAgentId ?? "未割当"}
              </p>
              <div className="flex gap-2">
                {["PLANNED", "open"].includes(mission.status) && (
                  <button
                    disabled={busy}
                    className={button}
                    onClick={() =>
                      void act(
                        `/api/company/missions/${encodeURIComponent(mission.id)}/start`,
                      )
                    }
                  >
                    開始
                  </button>
                )}
                {[
                  "ACTIVE",
                  "EXECUTING",
                  "REVIEWING",
                  "WAITING_APPROVAL",
                  "REPLAN_REQUIRED",
                ].includes(mission.status) && (
                  <button
                    disabled={busy}
                    className={button}
                    onClick={() =>
                      void act(
                        `/api/company/missions/${encodeURIComponent(mission.id)}/run`,
                      )
                    }
                  >
                    {busy ? "実行中…" : "Run / 再開"}
                  </button>
                )}
              </div>
              {run?.stopReason && (
                <p className="text-loss">停止理由: {run.stopReason}</p>
              )}
              <p>
                Step {run?.steps ?? 0} · Retry {run?.retries ?? 0} · Replan{" "}
                {run?.replans ?? 0}
              </p>
              <ol className="space-y-1">
                {plan?.steps.map((s) => (
                  <li key={s.id}>
                    {s.order}. {s.title} · {s.status}
                  </li>
                ))}
              </ol>
              <p>Review: {run?.review?.verdict ?? "未実施"}</p>
              {run?.review && (
                <ul>
                  {[
                    ...run.review.quality.findings,
                    ...run.review.security.findings,
                  ].map((f) => (
                    <li key={f.id}>
                      {f.verdict}: {f.message}
                    </li>
                  ))}
                </ul>
              )}
              <ul>
                {actions.map((a) => {
                  const result = snapshot?.state.runtime?.executions.find(
                    (e) => e.actionRequestId === a.id,
                  );
                  return (
                    <li key={a.id}>
                      {a.actionType} ·{" "}
                      {result?.status === "DRY_RUN" ||
                      result?.status === "NO_EXECUTOR"
                        ? "DRY RUN / 未実行"
                        : (result?.status ?? a.status)}{" "}
                      {a.reason}
                    </li>
                  );
                })}
              </ul>
              <ul>
                {snapshot?.state.approvals
                  .filter((a) => a.missionId === mission.id)
                  .map((a) => (
                    <li key={a.id}>
                      CEO Approval: {a.status} {a.decisionReason}
                    </li>
                  ))}
              </ul>
              <details>
                <summary>Step History / Outputs</summary>
                <ol>
                  {run?.history.map((h, i) => (
                    <li key={`${h.planId}:${h.stepId}:${i}`} className="mt-2">
                      {h.at} · {h.stepId}: {h.status} {h.reason}
                      {h.output && (
                        <pre className="whitespace-pre-wrap break-words">
                          {h.output}
                        </pre>
                      )}
                    </li>
                  ))}
                </ol>
                {snapshot?.state.runtime?.artifacts
                  .filter((a) => a.missionId === mission.id)
                  .map((a) => (
                    <details key={a.id}>
                      <summary>{a.path}</summary>
                      <pre className="whitespace-pre-wrap break-words">
                        {a.content}
                      </pre>
                    </details>
                  ))}
              </details>
              <p>
                Revenue:{" "}
                {revenue.length === 0
                  ? "記録なし"
                  : revenue
                      .map(
                        (e) =>
                          `¥${e.amountYen} (${e.confirmedByHuman ? "確認済" : "未確認"} / ${e.kind})`,
                      )
                      .join(" · ")}
              </p>
            </div>
          </details>
        );
      })}
    </section>
  );
}
