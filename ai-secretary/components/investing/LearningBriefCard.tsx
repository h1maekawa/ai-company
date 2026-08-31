"use client";

import { GraduationCap } from "lucide-react";
import type { InvestmentLearningBrief } from "@/app/lib/note/investing/learningBrief";
import { Card, CardHeader, EmptyState, Skeleton } from "./ui";

/** Investment Learning Brief（要件12）。今日の投資理解をFACT/AI解釈/問いに分けて表示する */
export function LearningBriefCard({
  brief,
  loading,
}: {
  brief: InvestmentLearningBrief | null;
  loading: boolean;
}) {
  return (
    <Card>
      <CardHeader
        title="今日のLearning"
        action={
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-brand-soft text-brand">
            <GraduationCap className="h-4 w-4" />
          </span>
        }
      />

      {loading ? (
        <div className="space-y-2.5">
          <Skeleton className="h-4 w-2/3" />
          <Skeleton className="h-3 w-full" />
          <Skeleton className="h-3 w-5/6" />
        </div>
      ) : !brief ? (
        <EmptyState
          title="本日は新しい材料がありませんでした"
          description="保有銘柄の評価損益や関連ニュースに変化が無い日は、無理にLearningを作りません。"
        />
      ) : (
        <div className="space-y-3">
          <p className="text-xs leading-relaxed text-slate-300">{brief.whatHappened}</p>
          {brief.whyRelevant && (
            <p className="text-[11px] leading-relaxed text-sub">なぜ関係する: {brief.whyRelevant}</p>
          )}

          <div className="rounded-xl border border-brand/25 bg-brand-soft px-3 py-2">
            <p className="text-[10px] font-semibold tracking-wide text-brand">今日覚える言葉</p>
            <p className="mt-0.5 text-xs font-semibold text-white">{brief.termToLearn.term}</p>
            <p className="mt-0.5 text-[11px] text-slate-300">{brief.termToLearn.explanation}</p>
          </div>

          {brief.portfolioRelation && (
            <p className="text-[11px] leading-relaxed text-sub">
              Portfolioとの関係: {brief.portfolioRelation}
            </p>
          )}
          {brief.aiInterpretation && (
            <p className="text-[11px] leading-relaxed text-sub">
              AIの解釈: {brief.aiInterpretation}
            </p>
          )}

          {brief.nextThingsToWatch.length > 0 && (
            <ul className="space-y-1">
              {brief.nextThingsToWatch.map((item, index) => (
                <li key={index} className="flex gap-2 text-[11px] text-sub">
                  <span className="text-brand">・</span>
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          )}

          {brief.todaysQuestion && (
            <div className="border-t border-hairline pt-3">
              <p className="text-[10px] font-semibold tracking-wide text-sub">今日の1問</p>
              <p className="mt-0.5 text-xs text-slate-200">{brief.todaysQuestion}</p>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}
