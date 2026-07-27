"use client";

import { InvestingShell } from "@/components/investing/Shell";
import { AiSuggestCard } from "@/components/investing/AiSuggestCard";
import { Card, CardHeader, EmptyState, Skeleton } from "@/components/investing/ui";
import { useAnalysis, usePortfolio } from "../usePortfolio";

const STATUS_LABEL = { good: "良好", warn: "注意", bad: "要改善" } as const;
const STATUS_COLOR = { good: "#22C55E", warn: "#F59E0B", bad: "#EF4444" } as const;

export default function AnalysisPage() {
  const { health, comment, loading } = useAnalysis();
  const { data } = usePortfolio();

  return (
    <InvestingShell title="AI分析">
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]">
        <Card>
          <CardHeader title="ポートフォリオの健全性" hint="保有データから決定的に算出しています" />

          {loading ? (
            <div className="space-y-3">
              <Skeleton className="h-16 w-40" />
              <Skeleton className="h-2 w-full" />
              <Skeleton className="h-24 w-full" />
            </div>
          ) : !health ? (
            <EmptyState title="スコアを算出できませんでした" description="保有データが未取込の可能性があります。" />
          ) : (
            <>
              <div className="flex items-end gap-3">
                <span className="text-5xl font-semibold tracking-tight text-white">{health.score}</span>
                <span className="pb-1.5 text-sm text-sub">/ 100</span>
                <span className="pb-1.5 text-sm font-semibold text-brand">{health.grade}</span>
              </div>
              <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/[0.08]">
                <div
                  className="h-full rounded-full bg-brand transition-all duration-700"
                  style={{ width: `${health.score}%` }}
                />
              </div>

              <ul className="mt-6 space-y-3">
                {health.factors.map((factor) => (
                  <li key={factor.label} className="rounded-xl border border-hairline bg-white/[0.02] p-3.5">
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-sm font-medium text-white">{factor.label}</span>
                      <span
                        className="rounded-full px-2 py-0.5 text-[11px] font-medium"
                        style={{
                          color: STATUS_COLOR[factor.status],
                          backgroundColor: `${STATUS_COLOR[factor.status]}1a`,
                        }}
                      >
                        {STATUS_LABEL[factor.status]}
                      </span>
                    </div>
                    <div className="mt-2 flex items-center gap-3">
                      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/[0.08]">
                        <div
                          className="h-full rounded-full transition-all duration-700"
                          style={{
                            width: `${factor.score}%`,
                            backgroundColor: STATUS_COLOR[factor.status],
                          }}
                        />
                      </div>
                      <span className="shrink-0 text-xs text-sub">{factor.detail}</span>
                    </div>
                  </li>
                ))}
              </ul>

              {data && data.positions.length > 0 && (
                <p className="mt-4 text-[11px] leading-relaxed text-sub">
                  ※ スコアは保有銘柄の集中度・資産クラス分散・銘柄数・現金比率から機械的に計算しています。
                  相場予測や将来リターンの推定は含みません。
                </p>
              )}
            </>
          )}
        </Card>

        <AiSuggestCard comment={comment} health={health} loading={loading} />
      </div>
    </InvestingShell>
  );
}
