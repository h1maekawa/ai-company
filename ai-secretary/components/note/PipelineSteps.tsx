"use client";

/**
 * 進捗のステップ表示 — 要件7
 *
 * 「リサーチ→執筆→SEO→投稿」を矢印でつなぎ、各工程の滞留を強調する。
 * 承認待ち（人の番）とタスク（エージェントの番）は別の数字として出す。
 * 混ぜると「誰のボールか」が分からなくなるため。
 */

import Link from "next/link";
import { useEffect, useState } from "react";
import { AlertTriangle, ChevronRight } from "lucide-react";
import type { Pipeline, PipelineStep } from "@/app/lib/review/pipelineTypes";
import { Skeleton } from "@/components/ui/primitives";

export function PipelineSteps() {
  const [pipeline, setPipeline] = useState<Pipeline | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/pipeline")
      .then((r) => r.json())
      .then((json: Pipeline & { error?: string }) => {
        if (!json.error) setPipeline(json);
      })
      .catch(() => undefined)
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <Skeleton className="h-32 rounded-2xl" />;
  if (!pipeline) return null;

  return (
    <div className="rounded-2xl border border-hairline bg-ink-card p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-sm font-semibold text-white">進行状況</p>
        <p className="text-[11px] text-sub">
          承認待ち {pipeline.pendingTotal}件
          {pipeline.blockedTotal > 0 && ` ・ テスト未通過 ${pipeline.blockedTotal}件`}
        </p>
      </div>

      {/* 横スクロールで4工程を必ず1行に保つ（折り返すと矢印の意味が壊れる） */}
      <div className="mt-3 overflow-x-auto">
        <div className="flex min-w-[520px] items-stretch gap-1">
          {pipeline.steps.map((step, index) => (
            <div key={step.phase} className="flex flex-1 items-center gap-1">
              {index > 0 && (
                <ChevronRight className="h-4 w-4 shrink-0 text-sub" aria-hidden />
              )}
              <StepCard step={step} />
            </div>
          ))}
        </div>
      </div>

      {pipeline.stalledTotal > 0 && (
        <Link
          href="/content/review"
          className="mt-3 flex items-center gap-1.5 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[11px] text-amber-400 hover:bg-amber-500/15"
        >
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
          {pipeline.stalledTotal}件が48時間以上動いていません。確認してください。
        </Link>
      )}
    </div>
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
