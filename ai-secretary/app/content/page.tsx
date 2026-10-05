"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { ArrowRight, BarChart3, CheckCircle2, PenLine, Settings } from "lucide-react";
import { AutomationMonitor } from "@/components/note/AutomationMonitor";
import { PipelineSteps } from "@/components/note/PipelineSteps";
import { AgentTaskList } from "@/components/note/AgentTaskList";
import { StyleProfileCard } from "@/components/note/StyleProfileCard";

type HomeData = {
  week: { publishedCount: number; revenue: number; conversions: number };
  nextActions: { label: string; href?: string }[];
  pendingRecommendations: number;
  draftSessions: number;
  queue: { scheduled: number; review: number };
  growth: {
    status: "AVAILABLE" | "INSUFFICIENT_DATA" | "UNAVAILABLE";
    impressions7d: number | null;
    impressions30d: number | null;
    bestContent: { contentId: string; impressions: number | null } | null;
    evidenceCount: number;
    confidence: "LOW" | "MEDIUM" | "HIGH" | null;
    observations: string[];
    nextExperiment: string | null;
    measuredThrough: string | null;
  };
};

export default function ContentHomePage() {
  const [data, setData] = useState<HomeData | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    fetch("/api/content/home")
      .then((r) => { if (!r.ok) throw new Error("CONTENT_HOME_UNAVAILABLE"); return r.json(); })
      .then((d) => setData(d))
      .catch(() => setFailed(true))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="space-y-5">
      <header className="rounded-2xl border border-hairline bg-ink-card p-5 sm:p-6">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-brand">コンテンツ事業</p>
        <div className="mt-2 flex flex-wrap items-end justify-between gap-4">
          <div><h1 className="text-2xl font-bold text-white">経営ダッシュボード</h1><p className="mt-1 text-sm text-sub">運用・成長・制作パイプラインを一画面で確認します。制作と確認はContent Studioで行います。</p></div>
          <div className="grid grid-cols-2 gap-2 sm:flex">
            <ActionLink href="/note?view=create" label="投稿を作る" icon={<PenLine className="h-4 w-4" />} />
            <ActionLink href="/note?view=review" label="確認する" icon={<CheckCircle2 className="h-4 w-4" />} />
            <ActionLink href="/note?view=results" label="成果を見る" icon={<BarChart3 className="h-4 w-4" />} />
            <ActionLink href="/note/settings" label="運用設定" icon={<Settings className="h-4 w-4" />} />
          </div>
        </div>
      </header>

      <section className="rounded-2xl border border-hairline bg-ink-card p-5">
        <div className="flex items-center justify-between gap-3"><div><p className="text-xs text-sub">今日の状態</p><h2 className="mt-1 text-base font-semibold text-white">Automation & Queue</h2></div>{failed && <span className="text-xs text-loss">未取得</span>}</div>
        <div className="mt-4 grid grid-cols-2 gap-3">
          <Stat label="投稿予定" value={value(data?.queue.scheduled, loading, failed)} suffix="件" />
          <Stat label="確認必要" value={value(data?.queue.review, loading, failed)} suffix="件" />
        </div>
      </section>

      <GrowthCard data={data?.growth ?? null} loading={loading} failed={failed} />

      <section className="rounded-2xl border border-hairline bg-ink-card p-5">
        <p className="text-xs text-sub">今週</p>
        <div className="mt-3 grid grid-cols-3 gap-3">
          <Stat label="公開投稿" value={value(data?.week.publishedCount, loading, failed)} />
          <Stat label="Revenue" value={data ? `¥${data.week.revenue.toLocaleString()}` : loading ? "…" : "—"} />
          <Stat label="Conversions" value={value(data?.week.conversions, loading, failed)} />
        </div>
      </section>

      <section className="rounded-2xl border border-hairline bg-ink-card p-5">
        <p className="text-sm font-semibold">NEXT ACTION</p>
        <div className="mt-3 space-y-2">
          {loading && <p className="text-xs text-sub">読み込み中…</p>}
          {!loading && !failed && (data?.nextActions.length ?? 0) === 0 && (
            <p className="text-xs text-sub">今のところ次のアクションはありません。新しい記事を作りましょう。</p>
          )}
          {data?.nextActions.map((action, i) => (
            <Link
              key={i}
              href={action.href ?? "/content"}
              className="flex items-center justify-between rounded-xl border border-hairline bg-white/[0.02] px-4 py-3 text-sm hover:border-brand/40"
            >
              <span>
                {i + 1}. {action.label}
              </span>
              <ArrowRight className="h-4 w-4 text-sub" />
            </Link>
          ))}
        </div>
      </section>

      <PipelineSteps />
      <section aria-label="AIの状態" className="space-y-5"><div><p className="text-xs text-sub">AIの状態</p><h2 className="mt-1 text-base font-semibold text-white">Automation Monitor</h2></div><AutomationMonitor /><AgentTaskList /></section>
      <StyleProfileCard />
    </div>
  );
}

function value(current: number | undefined, loading: boolean, failed: boolean) { return loading ? "…" : failed || current === undefined ? "—" : current; }

function ActionLink({ href, label, icon }: { href:string; label:string; icon:ReactNode }) { return <Link href={href} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-brand/30 bg-brand/10 px-3 text-xs font-semibold text-brand hover:bg-brand/15">{icon}{label}</Link>; }

function GrowthCard({ data, loading, failed }: { data:HomeData["growth"] | null; loading:boolean; failed:boolean }) {
  const status = failed || !data ? "UNAVAILABLE" : data.status;
  return <section className="rounded-2xl border border-hairline bg-ink-card p-5"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs text-sub">X Growth</p><h2 className="mt-1 text-base font-semibold text-white">Growth Intelligence</h2></div><span className="rounded-full border border-hairline px-2.5 py-1 text-[11px] text-sub">{loading ? "読込中" : status}</span></div>
    <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4"><Stat label="7日 Impressions" value={loading ? "…" : data?.impressions7d?.toLocaleString() ?? "—"} /><Stat label="30日 Impressions" value={loading ? "…" : data?.impressions30d?.toLocaleString() ?? "—"} /><Stat label="Comparable Evidence" value={loading ? "…" : data ? data.evidenceCount : "—"} suffix={data ? " samples" : undefined} /><Stat label="Confidence" value={loading ? "…" : data?.confidence ?? "—"} /></div>
    <div className="mt-4 grid gap-3 sm:grid-cols-2"><div className="rounded-xl border border-hairline bg-white/[0.02] p-3"><p className="text-[11px] text-sub">Best Content</p><p className="mt-1 break-all text-sm text-white">{data?.bestContent?.contentId ?? "—"}</p><p className="mt-1 text-xs text-sub">Impressions {data?.bestContent?.impressions?.toLocaleString() ?? "—"}</p></div><div className="rounded-xl border border-hairline bg-white/[0.02] p-3"><p className="text-[11px] text-sub">Next Experiment</p><p className="mt-1 text-sm text-white">{status === "AVAILABLE" ? data?.nextExperiment ?? "—" : status}</p></div></div>
    <div className="mt-3 rounded-xl border border-hairline bg-white/[0.02] p-3"><p className="text-[11px] text-sub">Observations</p>{status === "AVAILABLE" && data?.observations.length ? <ul className="mt-1 space-y-1 text-sm text-white">{data.observations.map((item)=><li key={item}>・{item}（相関・仮説。因果は未確認）</li>)}</ul> : <p className="mt-1 text-sm text-sub">{status}</p>}</div>
    <Link href="/note?view=results" className="mt-4 inline-flex min-h-11 items-center gap-1 text-sm font-semibold text-brand">成果を見る<ArrowRight className="h-4 w-4" /></Link>
  </section>;
}

function Stat({ label, value, suffix }: { label: string; value: string | number; suffix?:string }) {
  return (
    <div>
      <p className="text-[11px] text-sub">{label}</p>
      <p className="mt-1 text-lg font-bold">{value}{value !== "—" && value !== "…" ? suffix : null}</p>
    </div>
  );
}
