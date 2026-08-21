"use client";

import { useEffect, useState } from "react";
import { Card, CardHeader, Skeleton } from "@/components/ui/primitives";

type Insights = {
  revenueGoal: number;
  funnel: {
    impressions: number; profileVisits: number; followersGained: number; noteClicks: number;
    freeNoteViews: number; paidPurchases: number; repeatPurchases: number; revenue: number;
  };
  diagnosis: string;
  topics: {
    topicId: string; title: string; postCount: number; averageScore: number;
    winning: boolean; nextStage: string;
  }[];
};

export function GrowthInsights() {
  const [data, setData] = useState<Insights | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    fetch("/api/note/growth")
      .then(async (response) => {
        const body = await response.json();
        if (!response.ok) throw new Error(body.error);
        setData(body);
      })
      .catch((reason) => setError(reason instanceof Error ? reason.message : "取得に失敗しました"));
  }, []);
  if (!data && !error) return <Skeleton className="h-40 rounded-xl" />;
  if (error) return <p className="text-xs text-loss">{error}</p>;
  if (!data) return null;
  const funnel = data.funnel;
  const stages = [
    ["X表示", funnel.impressions], ["プロフィール", funnel.profileVisits],
    ["フォロー", funnel.followersGained], ["note遷移", funnel.noteClicks],
    ["無料note", funnel.freeNoteViews], ["購入", funnel.paidPurchases],
    ["リピート", funnel.repeatPurchases],
  ] as const;
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader title="90日ファネル" hint={`月間売上KGI ¥${data.revenueGoal.toLocaleString()}`} />
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {stages.map(([label, value]) => (
            <div key={label} className="rounded-lg bg-white/[0.03] p-2">
              <p className="text-[10px] text-sub">{label}</p>
              <p className="text-sm font-semibold tabular-nums">{value.toLocaleString()}</p>
            </div>
          ))}
          <div className="rounded-lg bg-gain/10 p-2">
            <p className="text-[10px] text-sub">note売上</p>
            <p className="text-sm font-semibold text-gain">¥{funnel.revenue.toLocaleString()}</p>
          </div>
        </div>
        <p className="mt-3 rounded-lg border border-brand/20 bg-brand/10 px-3 py-2 text-xs text-slate-200">
          次の改善: {data.diagnosis}
        </p>
      </Card>
      <Card>
        <CardHeader title="Winning Topics" hint="投稿単位ではなくテーマ単位で判定" />
        {data.topics.length === 0 ? <p className="text-xs text-sub">実績を取り込むと、昇格候補が表示されます。</p> : (
          <div className="space-y-2">
            {data.topics.slice(0, 8).map((topic) => (
              <div key={topic.topicId} className="flex items-center gap-3 rounded-lg bg-white/[0.03] p-2 text-xs">
                <span className={topic.winning ? "text-gain" : "text-sub"}>{topic.winning ? "WIN" : "TEST"}</span>
                <span className="min-w-0 flex-1 truncate text-slate-200">{topic.title}</span>
                <span className="text-sub">{topic.postCount}投稿 / {topic.averageScore}点</span>
                <span className="rounded bg-white/[0.06] px-2 py-0.5">次: {topic.nextStage}</span>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
