"use client";

import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import { AlertTriangle, ArrowRight, CalendarClock, CheckCircle2, Inbox, Settings, Sparkles } from "lucide-react";
import type { ApprovalQueueEntry, AutomationStatus } from "@/app/lib/note/automation/status";
import { OPERATION_MODE_HINTS } from "@/app/lib/note/research/types";
import { X_AUTOMATION_PERSONA_NAME } from "@/app/lib/note/types";
import { FreshnessBadge } from "@/components/ui/Freshness";
import { Skeleton } from "@/components/ui/primitives";

const MODE_STYLE: Record<string, string> = {
  autopilot: "border-gain/30 bg-gain/10 text-gain",
  review: "border-brand/30 bg-brand/10 text-brand",
  draft: "border-hairline bg-white/5 text-sub",
};

function timeJst(iso: string): string {
  return new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Tokyo",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}

function formatDateTime(value: string | null): string {
  return value ? new Date(value).toLocaleString("ja-JP") : "未実行";
}

function QaBadge({ entry }: { entry: ApprovalQueueEntry }) {
  if (!entry.qa) return <span className="mt-1 block text-[10px] text-sub">自動テスト: 未実行</span>;
  const failed = entry.qa.checks.filter((check) => check.severity === "blocking" && check.status === "fail");
  return (
    <span className="mt-1 block min-w-0 [overflow-wrap:anywhere]">
      <span className={`inline-flex rounded-full border px-1.5 py-0.5 text-[10px] font-medium ${entry.qa.passed ? "border-gain/25 bg-gain/10 text-gain" : "border-loss/25 bg-loss/10 text-loss"}`}>
        {entry.qa.passed ? "自動テスト通過" : "自動テスト未通過"}
      </span>
      {entry.qaSummary && entry.qa.passed && <span className="ml-1.5 break-words text-[10px] text-sub [overflow-wrap:anywhere]">{entry.qaSummary}</span>}
      {failed.length > 0 && (
        <span className="mt-0.5 block min-w-0 break-words text-[10px] leading-relaxed text-loss/80 [overflow-wrap:anywhere]">
          {failed.map((check) => `${check.label}: ${check.detail}`).join(" / ")}
        </span>
      )}
    </span>
  );
}

export function AutomationMonitor() {
  const [status, setStatus] = useState<AutomationStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [canaryBusy, setCanaryBusy] = useState(false);
  const [canaryOutcome, setCanaryOutcome] = useState("");

  async function runOneTimeCanary() {
    if (!window.confirm("新規のBrand-only X投稿を約10分後にBuffer予約し、実際に公開します。単発Canaryを実行しますか？")) return;
    setCanaryBusy(true);
    setCanaryOutcome("");
    try {
      const response = await fetch("/api/note/automation/one-time-canary", { method: "POST" });
      const result = await response.json() as { ok?: boolean; error?: string; reason?: string; haltedReason?: string; scheduledDraftIds?: string[] };
      setCanaryOutcome(result.ok && result.scheduledDraftIds?.length === 1
        ? "単発CanaryをBufferへ予約しました。実投稿・実績同期の確認待ちです。"
        : `予約していません: ${result.error ?? result.haltedReason ?? result.reason ?? "結果を確認できません"}`);
      if (result.ok) {
        const latest = await fetch("/api/note/automation/status").then((res) => res.json()) as AutomationStatus;
        setStatus(latest);
      }
    } catch { setCanaryOutcome("結果を確認できません。再実行せず、PlanとBufferを確認してください。"); }
    finally { setCanaryBusy(false); }
  }

  useEffect(() => {
    fetch("/api/note/automation/status")
      .then((response) => response.json())
      .then((json: AutomationStatus & { error?: string }) => {
        if (json.error) setError(json.error);
        else setStatus(json);
      })
      .catch(() => setError("運用状況の取得に失敗しました"))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <Skeleton className="h-56 rounded-2xl" />;
  if (error || !status) {
    return <section className="rounded-2xl border border-loss/25 bg-loss/10 px-4 py-3 text-sm text-loss">{error || "運用状況を取得できませんでした"}</section>;
  }

  const { mode, effective, blockers, today, approvalQueue } = status;
  const sortedSlots = [...today.slots].sort((a, b) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime());

  return (
    <section className="min-w-0 space-y-3">
      <div className="min-w-0 rounded-2xl border border-hairline bg-ink-card p-5">
        <div className="flex min-w-0 flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-white">X 自動運転</p>
            <p className="mt-0.5 text-[10px] text-sub">Creator: {X_AUTOMATION_PERSONA_NAME}</p>
          </div>
          <Link href="/note/settings" className="inline-flex shrink-0 items-center gap-1.5 rounded-xl border border-hairline px-3 py-2 text-xs text-sub hover:border-white/20 hover:text-white">
            <Settings className="h-3.5 w-3.5" />モードを変える
          </Link>
        </div>

        <div className="mt-4 grid min-w-0 grid-cols-2 gap-2 sm:grid-cols-5">
          <SummaryItem label="自動運転" value={effective ? "稼働可能" : "要設定"} tone={effective ? "gain" : "loss"} icon={effective ? <CheckCircle2 className="h-3.5 w-3.5" /> : <AlertTriangle className="h-3.5 w-3.5" />} />
          <div className={`min-w-0 rounded-xl border px-3 py-2.5 ${MODE_STYLE[mode]}`}>
            <p className="text-[10px] opacity-75">運用モード</p>
            <p className="mt-1 text-sm font-bold uppercase">{mode}</p>
          </div>
          <SummaryItem label="今日の予約" value={`${today.scheduled} / ${today.limit}件`} />
          <SummaryItem label="投稿済み" value={`${today.published}件`} />
          <SummaryItem label="確認待ち" value={`${approvalQueue.length}件`} tone={approvalQueue.length ? "brand" : "default"} />
        </div>

        <div className="mt-3 flex min-w-0 flex-wrap items-center gap-2 text-[11px]">
          <span className={`inline-flex items-center gap-1 ${effective ? "text-gain" : "text-loss"}`}>
            {effective ? <CheckCircle2 className="h-3.5 w-3.5" /> : <AlertTriangle className="h-3.5 w-3.5" />}
            {effective ? "自動投稿の稼働条件OK" : "自動予約は止まっています"}
          </span>
          <span className="text-sub">{OPERATION_MODE_HINTS[mode]}</span>
        </div>

        <div className={`mt-3 rounded-xl border px-3 py-2.5 text-xs ${status.queueLifecycle.backpressure ? "border-loss/30 bg-loss/10 text-loss" : "border-hairline bg-white/[0.02] text-sub"}`}>
          <span className="font-semibold">Content Queue: {status.queueLifecycle.activeUnresolved}件 unresolved</span>
          {status.queueLifecycle.backpressure
            ? <span className="ml-2">新規生成停止中 — {status.queueLifecycle.reasons.join(" / ")}</span>
            : <span className="ml-2">Lifecycle Guard正常</span>}
          <span className="mt-1 block text-[10px] opacity-80">
            needs_review {status.queueLifecycle.entries.filter((entry) => entry.derivedStates.includes("needs_review")).length} / qa_blocked {status.queueLifecycle.entries.filter((entry) => entry.derivedStates.includes("qa_blocked")).length} / approved_unscheduled {status.queueLifecycle.entries.filter((entry) => entry.derivedStates.includes("approved_unscheduled")).length} / stale {status.queueLifecycle.entries.filter((entry) => entry.derivedStates.includes("stale")).length} / cleanup_candidate {status.queueLifecycle.entries.filter((entry) => entry.derivedStates.includes("cleanup_candidate")).length} / reconciliation {status.queueLifecycle.entries.filter((entry) => entry.derivedStates.includes("linked_pending_reconciliation")).length}
          </span>
        </div>

        <div className="mt-3 rounded-xl border border-hairline bg-white/[0.02] px-3 py-2.5 text-xs text-sub">
          <p>ONE-TIME CANARY TRANSPORT TEST — 通常のHot判定は変更しません。新規のBrand-only投稿を1件だけXへ公開します。</p>
          <button type="button" onClick={runOneTimeCanary} disabled={canaryBusy || status.oneTimeCanary !== "unclaimed" || !effective || today.scheduled > 0 || today.published > 0 || status.queueLifecycle.backpressure}
            className="mt-2 rounded-lg border border-brand/40 px-3 py-1.5 font-semibold text-brand disabled:cursor-not-allowed disabled:opacity-40">
            {canaryBusy ? "実行中…" : "単発Canaryを実行"}
          </button>
          {status.oneTimeCanary === "claimed" && <p className="mt-1">単発Canaryは起動済みです。自動再実行しません。</p>}
          {canaryOutcome && <p role="status" className="mt-2 break-words">{canaryOutcome}</p>}
        </div>

        {blockers.length > 0 && (
          <div className="mt-4 min-w-0 rounded-xl border border-loss/30 bg-loss/10 p-4">
            <p className="inline-flex items-center gap-1.5 text-sm font-semibold text-loss"><AlertTriangle className="h-4 w-4" />自動投稿を動かすために直すこと</p>
            <ol className="mt-3 space-y-2">
              {blockers.map((blocker, index) => (
                <li key={blocker.label} className="flex min-w-0 gap-2 text-xs leading-relaxed">
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-loss/20 font-semibold text-loss">{index + 1}</span>
                  <span className="min-w-0 break-words [overflow-wrap:anywhere]"><span className="font-semibold text-white">{blocker.label}</span><span className="mt-0.5 block text-sub">{blocker.howToFix}</span></span>
                </li>
              ))}
            </ol>
          </div>
        )}
      </div>

      <div className="grid min-w-0 gap-3 lg:grid-cols-2">
        <div className="min-w-0 rounded-2xl border border-hairline bg-ink-card p-5">
          <div className="flex min-w-0 items-baseline justify-between gap-3">
            <p className="inline-flex items-center gap-1.5 text-sm font-semibold text-white"><CalendarClock className="h-4 w-4 text-sub" />今日のX</p>
            <p className="text-xs tabular-nums text-sub">予約 {today.scheduled} / {today.limit}件</p>
          </div>
          {sortedSlots.length === 0 ? (
            <p className="mt-3 text-xs text-sub">本日の予約はまだありません。投稿案の生成は毎朝7:10（JST）に走ります。</p>
          ) : (
            <ol className="mt-3 min-w-0 divide-y divide-hairline">
              {sortedSlots.map((slot) => (
                <li key={slot.draftId} className="flex min-w-0 items-start gap-3 py-2.5 text-xs first:pt-0 last:pb-0">
                  <span className="shrink-0 rounded-md bg-white/[0.05] px-2 py-1 tabular-nums font-semibold text-white">{timeJst(slot.scheduledAt)}</span>
                  <span className="min-w-0 flex-1 truncate py-1 text-sub">{slot.text}</span>
                  <span className="shrink-0 py-1 text-[10px] text-sub">{slot.status}</span>
                </li>
              ))}
            </ol>
          )}
        </div>

        <div className="min-w-0 rounded-2xl border border-hairline bg-ink-card p-5">
          <div className="flex min-w-0 items-baseline justify-between gap-3">
            <p className="inline-flex items-center gap-1.5 text-sm font-semibold text-white"><Inbox className="h-4 w-4 text-sub" />確認待ち</p>
            <p className="text-xs tabular-nums text-sub">{approvalQueue.length}件</p>
          </div>
          {approvalQueue.length === 0 ? (
            <div className="mt-3 flex items-center gap-2 rounded-xl bg-gain/5 px-3 py-3 text-xs text-gain"><CheckCircle2 className="h-4 w-4 shrink-0" />現在、あなたの確認が必要な投稿はありません</div>
          ) : (
            <ul className="mt-3 min-w-0 space-y-2">
              {approvalQueue.slice(0, 5).map((entry) => (
                <li key={entry.draftId} className="min-w-0 text-xs">
                  <Link href="/note?view=review" className="block min-w-0 rounded-lg px-2 py-1.5 hover:bg-white/[0.04]">
                    <span className="block min-w-0 truncate text-white">{entry.text}</span>
                    <span className="mt-0.5 block min-w-0 break-words text-[10px] text-loss/80 [overflow-wrap:anywhere]">{entry.reason}</span>
                    <QaBadge entry={entry} />
                  </Link>
                </li>
              ))}
            </ul>
          )}
          {approvalQueue.length > 5 && <Link href="/note?view=review" className="mt-2 inline-block text-[11px] font-medium text-brand hover:underline">残り{approvalQueue.length - 5}件を見る</Link>}
        </div>
      </div>

      <div className="min-w-0 rounded-2xl border border-hairline bg-ink-card p-5">
        <div className="flex items-center gap-2"><Sparkles className="h-4 w-4 text-brand" /><p className="text-sm font-semibold text-white">自動改善ループ</p></div>
        <div className="mt-3 grid min-w-0 grid-cols-2 gap-2 sm:grid-cols-4">
          <CompactStat label="Performance Sync" value={formatDateTime(status.improvementLoop.lastPerformanceSyncAt)} />
          <CompactStat label="Nightly Growth Review" value={formatDateTime(status.improvementLoop.lastNightlyGrowthReviewAt)} />
          <CompactStat label="Growth confidence" value={status.improvementLoop.growthConfidence ?? "未計測"} />
          <CompactStat label="Applied changes" value={`${status.improvementLoop.appliedChanges}件`} />
        </div>
        <ol className="mt-3 flex flex-wrap items-center gap-1.5 text-[10px] text-sub">
          {["Research", "X投稿", "実績取得", "改善", "次回へ"].map((step, index, steps) => (
            <li key={step} className="contents"><span className="rounded-lg border border-hairline px-2.5 py-1.5">{step}</span>{index < steps.length - 1 && <ArrowRight className="h-3 w-3 shrink-0 text-brand" />}</li>
          ))}
        </ol>
      </div>

      <div className="flex flex-wrap items-center justify-center gap-2 text-[11px] text-sub">
        <FreshnessBadge freshness={status.freshness} /><span>実績レコード {status.recent.records}件</span>
      </div>
    </section>
  );
}

function SummaryItem({ label, value, tone = "default", icon }: { label: string; value: string; tone?: "default" | "gain" | "loss" | "brand"; icon?: ReactNode }) {
  const toneClass = { default: "border-hairline bg-white/[0.02] text-white", gain: "border-gain/25 bg-gain/10 text-gain", loss: "border-loss/25 bg-loss/10 text-loss", brand: "border-brand/25 bg-brand/10 text-brand" }[tone];
  return <div className={`min-w-0 rounded-xl border px-3 py-2.5 ${toneClass}`}><p className="text-[10px] text-sub">{label}</p><p className="mt-1 flex min-w-0 items-center gap-1 break-words text-sm font-bold tabular-nums [overflow-wrap:anywhere]">{icon}{value}</p></div>;
}

function CompactStat({ label, value }: { label: string; value: string }) {
  return <div className="min-w-0 rounded-xl bg-white/[0.03] px-3 py-2.5"><p className="text-[10px] text-sub">{label}</p><p className="mt-1 truncate text-xs font-semibold text-white" title={value}>{value}</p></div>;
}
