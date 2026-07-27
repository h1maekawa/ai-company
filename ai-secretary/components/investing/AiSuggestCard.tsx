"use client";

import Link from "next/link";
import { Sparkles } from "lucide-react";
import type { AiComment, PortfolioHealth } from "@/app/lib/investing/analysis";
import { Card, CardHeader, EmptyState, Skeleton } from "./ui";

const STATUS_COLOR = {
  good: "#22C55E",
  warn: "#F59E0B",
  bad: "#EF4444",
} as const;

export function AiSuggestCard({
  comment,
  health,
  loading,
}: {
  comment: AiComment | null;
  health: PortfolioHealth | null;
  loading: boolean;
}) {
  return (
    <Card className="bg-gradient-to-b from-brand-soft to-transparent">
      <CardHeader
        title="AIからの今日の提案"
        action={
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-brand-soft text-brand">
            <Sparkles className="h-4 w-4" />
          </span>
        }
      />

      {loading ? (
        <div className="space-y-2.5">
          <Skeleton className="h-4 w-2/3" />
          <Skeleton className="h-3 w-full" />
          <Skeleton className="h-3 w-5/6" />
          <Skeleton className="h-9 w-full" />
        </div>
      ) : !comment ? (
        <EmptyState
          title="提案を生成できませんでした"
          description="保有データが未取込か、AIの応答を取得できませんでした。"
        />
      ) : (
        <div className="space-y-3">
          <p className="text-sm font-semibold leading-snug text-white">{comment.headline}</p>
          <p className="text-xs leading-relaxed text-slate-300">{comment.body}</p>

          {comment.reasons.length > 0 && (
            <ul className="space-y-1">
              {comment.reasons.map((reason, index) => (
                <li key={index} className="flex gap-2 text-[11px] text-sub">
                  <span className="text-brand">・</span>
                  <span>{reason}</span>
                </li>
              ))}
            </ul>
          )}

          {comment.action && (
            <div className="rounded-xl border border-brand/25 bg-brand-soft px-3 py-2">
              <p className="text-[10px] font-semibold tracking-wide text-brand">次の一手</p>
              <p className="mt-0.5 text-xs text-slate-200">{comment.action}</p>
            </div>
          )}

          {health && (
            <div className="border-t border-hairline pt-3">
              <div className="flex items-baseline justify-between">
                <span className="text-[11px] text-sub">ポートフォリオ健全性</span>
                <span className="text-sm font-semibold text-white">
                  {health.score}
                  <span className="text-[11px] font-normal text-sub"> / 100・{health.grade}</span>
                </span>
              </div>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/[0.08]">
                <div
                  className="h-full rounded-full bg-brand transition-all duration-700"
                  style={{ width: `${health.score}%` }}
                />
              </div>
              <ul className="mt-2.5 space-y-1">
                {health.factors.map((factor) => (
                  <li key={factor.label} className="flex items-center gap-2 text-[11px]">
                    <span
                      className="h-1.5 w-1.5 shrink-0 rounded-full"
                      style={{ backgroundColor: STATUS_COLOR[factor.status] }}
                    />
                    <span className="flex-1 text-slate-300">{factor.label}</span>
                    <span className="text-sub">{factor.detail}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <Link
            href="/investing/analysis"
            className="block rounded-xl bg-brand py-2.5 text-center text-xs font-semibold text-white transition-colors hover:bg-brand/85"
          >
            詳細を確認する
          </Link>
        </div>
      )}
    </Card>
  );
}
