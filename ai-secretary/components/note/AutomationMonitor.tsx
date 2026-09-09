"use client";

/**
 * 運用モニター（TASK-N4）
 *
 * ノート事業部のトップに置く「監視＋承認」ダッシュボード。
 * 初見で次の3つが1画面で分かることだけを目的にする:
 *   1. 今どのモードで回っているか
 *   2. 今日は何が予約されているか
 *   3. 承認が必要なものはあるか
 * 作文の導線はここに混ぜない（作文は review モードの承認画面側へ寄せる）。
 */

import Link from "next/link";
import { useEffect, useState } from "react";
import { AlertTriangle, CalendarClock, CheckCircle2, Inbox, Settings } from "lucide-react";
import type { AutomationStatus } from "@/app/lib/note/automation/status";
import { OPERATION_MODE_HINTS, OPERATION_MODE_LABELS } from "@/app/lib/note/research/types";
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

export function AutomationMonitor() {
  const [status, setStatus] = useState<AutomationStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/note/automation/status")
      .then((r) => r.json())
      .then((json: AutomationStatus & { error?: string }) => {
        if (json.error) setError(json.error);
        else setStatus(json);
      })
      .catch(() => setError("運用状況の取得に失敗しました"))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <Skeleton className="h-56 rounded-2xl" />;
  if (error || !status) {
    return (
      <section className="rounded-2xl border border-loss/25 bg-loss/10 px-4 py-3 text-sm text-loss">
        {error || "運用状況を取得できませんでした"}
      </section>
    );
  }

  const { mode, effective, blockers, today, approvalQueue } = status;

  return (
    <section className="space-y-3">
      {/* ─── 1. 今どのモードか ───────────────────── */}
      <div className="rounded-2xl border border-hairline bg-ink-card p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs text-sub">運用モード</p>
            <div className="mt-1.5 flex items-center gap-2">
              <span
                className={`rounded-full border px-3 py-1 text-sm font-semibold ${MODE_STYLE[mode]}`}
              >
                {OPERATION_MODE_LABELS[mode]}
              </span>
              {effective ? (
                <span className="inline-flex items-center gap-1 text-[11px] text-gain">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  実際に自動で回っています
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 text-[11px] text-loss">
                  <AlertTriangle className="h-3.5 w-3.5" />
                  自動予約は止まっています
                </span>
              )}
            </div>
            <p className="mt-1.5 text-[11px] text-sub">{OPERATION_MODE_HINTS[mode]}</p>
          </div>
          <Link
            href="/content/settings"
            className="inline-flex shrink-0 items-center gap-1.5 rounded-xl border border-hairline px-3 py-2 text-xs text-sub hover:border-white/20 hover:text-white"
          >
            <Settings className="h-3.5 w-3.5" />
            モードを変える
          </Link>
        </div>

        {blockers.length > 0 && (
          <ul className="mt-3 space-y-1.5">
            {blockers.map((blocker) => (
              <li
                key={blocker.label}
                className="rounded-lg bg-white/[0.03] px-3 py-2 text-[11px] leading-relaxed"
              >
                <span className="font-medium text-white">{blocker.label}</span>
                <span className="ml-2 text-sub">{blocker.howToFix}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        {/* ─── 2. 今日の予約状況 ─────────────────── */}
        <div className="rounded-2xl border border-hairline bg-ink-card p-5">
          <div className="flex items-baseline justify-between gap-3">
            <p className="inline-flex items-center gap-1.5 text-sm font-semibold text-white">
              <CalendarClock className="h-4 w-4 text-sub" />
              今日の予約
            </p>
            <p className="text-xs tabular-nums text-sub">
              予約 {today.scheduled} / 投稿済み {today.published}・上限 {today.limit}件
            </p>
          </div>

          {today.slots.length === 0 ? (
            <p className="mt-3 text-xs text-sub">
              本日の予約はまだありません。生成は毎朝8時（JST）に走ります。
            </p>
          ) : (
            <ul className="mt-3 space-y-2">
              {today.slots.map((slot) => (
                <li key={slot.draftId} className="flex items-start gap-3 text-xs">
                  <span className="shrink-0 tabular-nums font-medium text-white">
                    {timeJst(slot.scheduledAt)}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-sub">{slot.text}</span>
                  <span className="shrink-0 text-[10px] text-sub">{slot.status}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* ─── 3. 承認が必要なもの ───────────────── */}
        <div className="rounded-2xl border border-hairline bg-ink-card p-5">
          <div className="flex items-baseline justify-between gap-3">
            <p className="inline-flex items-center gap-1.5 text-sm font-semibold text-white">
              <Inbox className="h-4 w-4 text-sub" />
              要承認・要確認
            </p>
            <p className="text-xs tabular-nums text-sub">{approvalQueue.length}件</p>
          </div>

          {approvalQueue.length === 0 ? (
            <p className="mt-3 text-xs text-sub">確認待ちはありません。</p>
          ) : (
            <ul className="mt-3 space-y-2">
              {approvalQueue.slice(0, 5).map((entry) => (
                <li key={entry.draftId} className="text-xs">
                  <Link
                    href="/content/x"
                    className="block rounded-lg px-2 py-1.5 hover:bg-white/[0.04]"
                  >
                    <span className="block truncate text-white">{entry.text}</span>
                    <span className="mt-0.5 block text-[10px] text-loss/80">{entry.reason}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
          {approvalQueue.length > 5 && (
            <Link
              href="/content/x"
              className="mt-2 inline-block text-[11px] font-medium text-brand hover:underline"
            >
              残り{approvalQueue.length - 5}件を見る
            </Link>
          )}
        </div>
      </div>

      {/* ─── 直近実績の鮮度（TASK-C2の共通表示） ───── */}
      <div className="flex flex-wrap items-center justify-center gap-2 text-[11px] text-sub">
        <FreshnessBadge freshness={status.freshness} />
        <span>実績レコード {status.recent.records}件</span>
      </div>
    </section>
  );
}
