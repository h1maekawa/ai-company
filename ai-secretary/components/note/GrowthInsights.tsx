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
  summary: {
    postCount: number; metricsSyncedPostCount: number; winningTopicCount: number;
    noteCandidateCount: number; noteDraftCount: number; freeNoteCandidateCount: number;
    paidNoteCandidateCount: number; revenueProgressPct: number;
  };
  topics: {
    topicId: string; title: string; postCount: number; averageScore: number;
    winning: boolean; nextStage: string;
  }[];
  dailyReview?: {
    date: string; confidence: string;
    dataFreshness: { x: string; note: string };
    xSummary: { postCount: number; impressions?: number; engagements?: number; linkClicks?: number; followersGained?: number };
    noteSummary: { views?: number; sales?: number; revenue?: number };
    comparisons: Record<"yesterday" | "last7Days" | "previous7Days" | "last28Days", { postCount: number; impressions?: number; engagements?: number; linkClicks?: number }>;
    winningTopics: Array<{ topicId: string; averageScore: number }>;
    winningPatterns: Array<{ key: string; sampleSize: number; averageScore: number }>;
    bottleneck: string; insights: string[]; experiments: string[];
    appliedChanges: Array<{ field: string; before: unknown; after: unknown; reason: string }>;
    noteApprovalPriorities: Array<{ articleId: string; title: string; reason: string; priceSuggestion?: string }>;
  };
  reviewHistory: Insights["dailyReview"][];
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
      {data.dailyReview && <DailyReview review={data.dailyReview} />}
      <Card>
        <CardHeader title="90日ファネル" hint={`月間売上KGI ¥${data.revenueGoal.toLocaleString()}`} />
        <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {[
            ["X投稿", data.summary.postCount], ["実績取得済み", data.summary.metricsSyncedPostCount],
            ["Winning Topic", data.summary.winningTopicCount], ["note候補", data.summary.noteCandidateCount],
            ["note下書き", data.summary.noteDraftCount], ["無料候補", data.summary.freeNoteCandidateCount],
            ["有料候補", data.summary.paidNoteCandidateCount], ["10万円進捗", `${data.summary.revenueProgressPct}%`],
          ].map(([label, value]) => (
            <div key={label} className="rounded-lg border border-hairline px-2 py-1.5">
              <p className="text-[10px] text-sub">{label}</p><p className="text-sm font-semibold">{value}</p>
            </div>
          ))}
        </div>
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

function DailyReview({ review }: { review: NonNullable<Insights["dailyReview"]> }) {
  const [period, setPeriod] = useState<"yesterday" | "last7Days" | "last28Days">("yesterday");
  const selected = review.comparisons[period];
  const metric = (value?: number, prefix = "") => value === undefined ? "Unavailable" : `${prefix}${value.toLocaleString()}`;
  return <Card>
    <CardHeader title="今日の事業部レビュー" hint={`${review.date} / confidence: ${review.confidence}`} />
    <div className="mb-3 flex gap-1">
      {(["yesterday", "last7Days", "last28Days"] as const).map((key) => <button key={key} onClick={() => setPeriod(key)} className={`rounded px-2 py-1 text-[10px] ${period === key ? "bg-brand text-white" : "bg-white/[0.05] text-sub"}`}>{key === "yesterday" ? "Today / Yesterday" : key === "last7Days" ? "7 Days" : "28 Days"}</button>)}
    </div>
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      <ReviewMetric label="X投稿数" value={String(selected.postCount)} />
      <ReviewMetric label="Impressions" value={metric(selected.impressions)} />
      <ReviewMetric label="Engagement" value={metric(selected.engagements)} />
      <ReviewMetric label="Link Clicks" value={metric(selected.linkClicks)} />
      <ReviewMetric label="note Views" value={metric(review.noteSummary.views)} />
      <ReviewMetric label="note Sales" value={metric(review.noteSummary.sales)} />
      <ReviewMetric label="Revenue" value={metric(review.noteSummary.revenue, "¥")} />
      <ReviewMetric label="Follower data" value={review.xSummary.followersGained === undefined ? "Unavailable" : review.xSummary.followersGained.toLocaleString()} />
    </div>
    <p className="mt-2 text-[10px] text-sub">note metrics: {review.dataFreshness.note}</p>
    <div className="mt-3 grid gap-3 sm:grid-cols-2">
      <ReviewSection title="今日の結論" lines={[...review.insights, `Bottleneck: ${review.bottleneck}`, review.winningPatterns[0] ? `Winning Pattern: ${review.winningPatterns[0].key}（n=${review.winningPatterns[0].sampleSize}）` : "Winning Pattern: 最低サンプル待ち"]} />
      <ReviewSection title="明日の戦略" lines={review.experiments.length ? review.experiments : ["データを蓄積し、現行戦略を維持"]} />
      <ReviewSection title="Applied Automatically" lines={review.appliedChanges.length ? review.appliedChanges.map((item) => `${item.field}: ${JSON.stringify(item.before)} → ${JSON.stringify(item.after)} / ${item.reason}`) : ["自動変更なし"]} />
      <ReviewSection title="Human Decision Needed" lines={review.noteApprovalPriorities.length ? review.noteApprovalPriorities.map((item) => `${item.title}${item.priceSuggestion ? ` / 価格候補 ${item.priceSuggestion}` : ""} — ${item.reason}`) : ["note公開候補なし。価格・公開は引き続き人が決定"]} />
    </div>
  </Card>;
}

function ReviewMetric({ label, value }: { label: string; value: string }) {
  return <div className="rounded-lg bg-white/[0.03] p-2"><p className="text-[10px] text-sub">{label}</p><p className="text-sm font-semibold">{value}</p></div>;
}

function ReviewSection({ title, lines }: { title: string; lines: string[] }) {
  return <div className="rounded-lg border border-hairline p-3"><p className="text-xs font-semibold">{title}</p><ol className="mt-2 space-y-1 text-[10px] text-sub">{lines.slice(0, 4).map((line, index) => <li key={`${title}-${index}`}>{index + 1}. {line}</li>)}</ol></div>;
}
