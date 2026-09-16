"use client";

/**
 * 進捗のステップ表示 — 要件7
 *
 * 「リサーチ→執筆→SEO→投稿」を矢印でつなぎ、各工程の滞留を強調する。
 * 承認待ち（人の番）とタスク（エージェントの番）は別の数字として出す。
 * 混ぜると「誰のボールか」が分からなくなるため。
 *
 * 状態は loading / success / empty / error を分けて扱う。
 * 以前は取得に失敗するとパネルごと消えていて、**「案件が無い」と
 * 「読み込めなかった」が区別できなかった**。監視が主な操作の画面で
 * 黙って消えるのは危険側なので、失敗は失敗として出す。
 *
 * 型と集計は pipelineTypes.ts（fs非依存）から取る。pipeline.ts は
 * Server専用で、ここから import してはいけない。
 */

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { AlertTriangle, ChevronRight, RefreshCw } from "lucide-react";
import type { Pipeline, PipelineStep } from "@/app/lib/review/pipelineTypes";
import { Skeleton } from "@/components/ui/primitives";

/** 再取得の間隔。滞留を出す画面なので開きっぱなしで固まらないようにする */
const REFRESH_MS = 60_000;

export function PipelineSteps() {
  const [pipeline, setPipeline] = useState<Pipeline | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [reloading, setReloading] = useState(false);
  // 取得中に再取得が重ならないようにする（可視化復帰とintervalが同時に来る）
  const inFlight = useRef(false);

  const load = useCallback(async (): Promise<void> => {
    if (inFlight.current) return;
    inFlight.current = true;
    setReloading(true);
    try {
      const res = await fetch("/api/pipeline");
      const json = (await res.json()) as Pipeline & { error?: string };
      if (!res.ok || json.error) {
        // 直前の正常データは消さない。古い数字でも「最終更新」と一緒に見える方がよい
        setError(json.error ?? "進行状況を取得できませんでした");
        return;
      }
      setPipeline(json);
      setError(null);
    } catch {
      setError("進行状況を取得できませんでした");
    } finally {
      inFlight.current = false;
      setReloading(false);
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();

    // 画面が見えていないあいだは叩かない。復帰時は間隔を待たずに取り直す
    const tick = () => {
      if (document.visibilityState === "visible") void load();
    };
    const timer = window.setInterval(tick, REFRESH_MS);
    document.addEventListener("visibilitychange", tick);

    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [load]);

  if (loading) return <Skeleton className="h-32 rounded-2xl" />;

  // 一度も取得できていない場合だけ、ステップの代わりにエラーを出す
  if (!pipeline) {
    return (
      <div className="rounded-2xl border border-hairline bg-ink-card p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <p className="text-sm font-semibold text-white">進行状況</p>
          <ReloadButton onClick={load} busy={reloading} />
        </div>
        <ErrorNote message={error ?? "進行状況を取得できませんでした"} />
      </div>
    );
  }

  const idle = pipeline.pendingTotal === 0 && pipeline.steps.every((step) => step.tasks === 0);

  return (
    <div className="rounded-2xl border border-hairline bg-ink-card p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-sm font-semibold text-white">進行状況</p>
        <div className="flex items-baseline gap-2">
          <p className="text-[11px] text-sub">
            承認待ち {pipeline.pendingTotal}件
            {pipeline.blockedTotal > 0 && ` ・ テスト未通過 ${pipeline.blockedTotal}件`}
          </p>
          <ReloadButton onClick={load} busy={reloading} />
        </div>
      </div>

      {/* 横スクロールで4工程を必ず1行に保つ（折り返すと矢印の意味が壊れる） */}
      <div className="mt-3 overflow-x-auto">
        <div className="flex min-w-[520px] items-stretch gap-1">
          {pipeline.steps.map((step, index) => (
            <div key={step.phase} className="flex flex-1 items-center gap-1">
              {index > 0 && <ChevronRight className="h-4 w-4 shrink-0 text-sub" aria-hidden />}
              <StepCard step={step} />
            </div>
          ))}
        </div>
      </div>

      {/* 「案件が無い」ことを明示する。0が並ぶだけだと取得できていないようにも見える */}
      {idle && !error && (
        <p className="mt-3 text-[11px] text-sub">進行中の案件はありません。</p>
      )}

      {pipeline.stalledTotal > 0 && (
        <Link
          href="/content/review"
          className="mt-3 flex items-center gap-1.5 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[11px] text-amber-400 hover:bg-amber-500/15"
        >
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
          {pipeline.stalledTotal}件が48時間以上動いていません。確認してください。
        </Link>
      )}

      {/* 取得に失敗しても表示は残す。ただし数字が古いことは必ず伝える */}
      {error && <ErrorNote message={`${error}（表示は最後に取得できた内容です）`} />}

      <p className="mt-2 text-[10px] text-sub">最終更新 {formatLoadedAt(pipeline.loadedAt)}</p>
    </div>
  );
}

/** 「12:14:32」。日付が壊れていたらそのまま出さずに伏せる */
function formatLoadedAt(loadedAt: string): string {
  const date = new Date(loadedAt);
  if (Number.isNaN(date.getTime())) return "不明";
  return date.toLocaleTimeString("ja-JP", { hour12: false });
}

function ReloadButton({ onClick, busy }: { onClick: () => void; busy: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      aria-label="進行状況を再読み込み"
      className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] text-sub hover:text-white disabled:opacity-50"
    >
      <RefreshCw className={`h-3 w-3 ${busy ? "animate-spin" : ""}`} aria-hidden />
      再読み込み
    </button>
  );
}

function ErrorNote({ message }: { message: string }) {
  return (
    <p
      role="status"
      className="mt-3 flex items-start gap-1.5 rounded-lg border border-loss/30 bg-loss/10 px-3 py-2 text-[11px] text-loss"
    >
      <AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden />
      {message}
    </p>
  );
}

function StepCard({ step }: { step: PipelineStep }) {
  const idle = step.pending === 0 && step.tasks === 0;

  return (
    <div
      className={`min-w-0 flex-1 rounded-xl border px-3 py-2.5 ${
        step.stalled > 0
          ? "border-amber-500/30 bg-amber-500/[0.06]"
          : idle
            ? "border-hairline bg-white/[0.02]"
            : "border-brand/25 bg-brand/[0.06]"
      }`}
    >
      <p className="truncate text-[11px] font-medium text-slate-300">{step.label}</p>

      <div className="mt-1 flex items-baseline gap-2">
        <span
          className={`text-lg font-semibold tabular-nums leading-none ${
            idle ? "text-sub" : "text-white"
          }`}
        >
          {step.pending}
        </span>
        <span className="text-[10px] text-sub">承認待ち</span>
      </div>

      <div className="mt-1 flex flex-wrap gap-x-2 text-[10px] text-sub">
        {step.tasks > 0 && <span>タスク{step.tasks}</span>}
        {step.blocked > 0 && <span className="text-loss">未通過{step.blocked}</span>}
        {step.stalled > 0 && <span className="text-amber-400">滞留{step.stalled}</span>}
      </div>
    </div>
  );
}
