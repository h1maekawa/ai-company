"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { AlertTriangle, ArrowRight, BrainCircuit, FileText, RefreshCw, Wallet } from "lucide-react";
import { platformBrandPolicy } from "@/app/lib/content/brandProfile";
import type { XDashboardData, XDashboardRange } from "@/app/lib/content/xDashboard";

type View = "overview" | "content" | "learning" | "revenue";
type Ranking = XDashboardData["availableRankings"][number];
type Draft = { id: string; text: string; status: string; draftType?: string; sourceNoteArticleId?: string; createdAt: string };
type Material = { id: string; title: string; sourceType: string };

const DRAFT_TYPES = ["opinion", "experience", "learning", "how-to", "hook", "note-traffic", "product-traffic"];
const RANGE_LABELS: Record<XDashboardRange, string> = { today: "今日", sevenDays: "7日", thirtyDays: "30日" };
const MODE_LABELS = { autopilot: "AUTOPILOT", review: "承認あり", draft: "下書きのみ" } as const;
const SLOT_LABELS: Record<string, string> = {
  planned: "生成予定", generated: "投稿準備済み", scheduled: "予約済み", published: "公開済み",
  blocked: "公開停止", failed: "エラー", ambiguous: "要確認", missed: "未実行", skipped: "スキップ",
};

async function api(url: string, method: string, body?: unknown) {
  const res = await fetch(url, { method, headers: body ? { "Content-Type": "application/json" } : undefined, body: body ? JSON.stringify(body) : undefined });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "失敗しました");
  return data;
}

export default function XDashboardPage() {
  const [view, setView] = useState<View>("overview");
  const [dashboard, setDashboard] = useState<XDashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [range, setRange] = useState<XDashboardRange>("sevenDays");

  useEffect(() => {
    const query = new URLSearchParams(window.location.search).get("view");
    if (query === "content" || query === "learning" || query === "revenue") setView(query);
  }, []);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/content/x/dashboard", { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "X Dashboardの取得に失敗しました");
      setDashboard(data);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "X Dashboardの取得に失敗しました");
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { void load(); }, []);

  function selectView(next: View) {
    setView(next);
    window.history.replaceState(null, "", next === "overview" ? "/content/x" : `/content/x?view=${next}`);
  }

  return (
    <div className="space-y-5">
      <header className="rounded-2xl border border-hairline bg-ink-card p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div><p className="text-xs font-semibold uppercase tracking-[0.18em] text-brand">X</p><h2 className="mt-1 text-2xl font-bold text-white">まえみち</h2></div>
          <div className="flex items-center gap-3">
            <span className="rounded-full border border-gain/30 bg-gain/10 px-3 py-1.5 text-xs font-semibold text-gain">● {dashboard ? MODE_LABELS[dashboard.mode] : "—"}</span>
            <button type="button" onClick={() => void load()} disabled={loading} aria-label="再読み込み" className="rounded-lg border border-hairline p-2 text-sub hover:text-white disabled:opacity-50"><RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /></button>
          </div>
        </div>
        <nav aria-label="X Dashboard views" className="mt-5 flex gap-1 overflow-x-auto rounded-xl border border-hairline bg-black/10 p-1">
          {(["overview", "content", "learning", "revenue"] as View[]).map((item) => <button key={item} type="button" onClick={() => selectView(item)} className={`min-h-10 shrink-0 rounded-lg px-4 text-xs font-semibold ${view === item ? "bg-brand text-white" : "text-sub hover:text-white"}`}>{item[0].toUpperCase() + item.slice(1)}</button>)}
        </nav>
      </header>

      {error && <div className="rounded-xl border border-loss/30 bg-loss/10 p-4 text-sm text-loss">{error}</div>}
      {view === "overview" && <Overview data={dashboard} loading={loading} range={range} onRange={setRange} />}
      {view === "content" && <ContentStudio />}
      {view === "learning" && <Learning data={dashboard} />}
      {view === "revenue" && <Revenue data={dashboard} />}
    </div>
  );
}

function Overview({ data, loading, range, onRange }: { data: XDashboardData | null; loading: boolean; range: XDashboardRange; onRange: (range: XDashboardRange) => void }) {
  const metrics = data?.metrics[range];
  return <>
    <section className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_18rem]">
      <div className="order-1 min-w-0 lg:col-start-1 lg:row-start-1">
        <section className="rounded-2xl border border-hairline bg-ink-card p-5">
          <div className="flex flex-wrap items-center justify-between gap-3"><SectionTitle eyebrow="KPI">Performance</SectionTitle><RangeSelector value={range} onChange={onRange} /></div>
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
            <Kpi label="Impressions" value={formatNumber(metrics?.impressions, loading)} />
            <Kpi label="Posts" value={loading ? "…" : metrics ? String(metrics.postCount) : "—"} />
            <Kpi label="Avg Impressions / Post" value={formatNumber(metrics?.averageImpressionsPerPost, loading)} />
            <Kpi label="Profile Visits" value={formatNumber(metrics?.profileVisits, loading)} />
            <Kpi label="Link Clicks" value={formatNumber(metrics?.linkClicks, loading)} />
            <Kpi label="Replies" value={formatNumber(metrics?.replies, loading)} />
            <Kpi label="Reposts" value={formatNumber(metrics?.reposts, loading)} />
            {metrics?.revenue !== null && metrics?.revenue !== undefined && <Kpi label="Revenue" value={`¥${Math.round(metrics.revenue).toLocaleString()}`} />}
            {metrics?.revenuePer1000Impressions !== null && metrics?.revenuePer1000Impressions !== undefined && <Kpi label="Revenue / 1,000 Impressions" value={`¥${Math.round(metrics.revenuePer1000Impressions).toLocaleString()}`} />}
          </div>
        </section>
      </div>
      <div className="order-2 min-w-0 lg:col-start-1 lg:row-start-2"><PerformanceTrend data={data} range={range} /></div>
      <div className="order-3 min-w-0 lg:col-start-2 lg:row-start-1"><TodayContent data={data} /></div>
      <div className="order-4 min-w-0 lg:col-start-1 lg:row-start-3"><TopContent data={data} /></div>
      <div className="order-5 min-w-0 lg:col-start-2 lg:row-start-2"><Queue data={data} /></div>
      <div className="order-6 min-w-0 lg:col-start-2 lg:row-start-3"><Attention data={data} /></div>
    </section>
    <Learning data={data} compact />
  </>;
}

function PerformanceTrend({ data, range }: { data: XDashboardData | null; range: XDashboardRange }) {
  const days = range === "today" ? 1 : range === "sevenDays" ? 7 : 30;
  const points = (data?.trend ?? []).slice(-days);
  const max = Math.max(...points.map((point) => point.impressions ?? 0), 0);
  return <section className="rounded-2xl border border-hairline bg-ink-card p-5"><SectionTitle eyebrow="Trend">Performance</SectionTitle>
    {points.length < 2 ? <Empty label="INSUFFICIENT_DATA" /> : <div className="mt-4 space-y-2">{points.map((point) => <div key={point.date} className="grid grid-cols-[5.5rem_minmax(0,1fr)_4rem] items-center gap-3 text-xs"><span className="text-sub">{point.date.slice(5)}</span><div className="h-2 overflow-hidden rounded-full bg-white/5"><div className="h-full rounded-full bg-brand" style={{ width: point.impressions === null || max === 0 ? "0%" : `${Math.max(4, point.impressions / max * 100)}%` }} /></div><span className="text-right text-slate-200">{point.impressions === null ? "—" : point.impressions.toLocaleString()}</span></div>)}</div>}
    <p className="mt-3 text-[11px] text-sub">Postsと実測Impressionsのみ。欠損値は補間しません。</p>
  </section>;
}

function TodayContent({ data }: { data: XDashboardData | null }) {
  return <section className="rounded-2xl border border-hairline bg-ink-card p-5"><SectionTitle eyebrow="DailyX Plan">今日の投稿</SectionTitle><div className="mt-4 space-y-3">
    {!data?.todayContent.length && <Empty label="本日のPlanなし" />}
    {data?.todayContent.map((item) => <div key={item.id} className="border-l border-brand/50 pl-3"><div className="flex items-center justify-between gap-2 text-xs"><span className="font-semibold text-white">{item.scheduledTime}</span><span className="text-sub">{SLOT_LABELS[item.status] ?? item.status}</span></div>{item.excerpt && <p className="mt-1 line-clamp-2 text-xs leading-5 text-slate-300">{item.excerpt}</p>}</div>)}
  </div></section>;
}

function Queue({ data }: { data: XDashboardData | null }) {
  return <section className="rounded-2xl border border-hairline bg-ink-card p-5"><SectionTitle eyebrow="Pipeline">Queue</SectionTitle><dl className="mt-4 space-y-2 text-sm"><Row label="Scheduled" value={data?.queue.scheduled} /><Row label="Review" value={data?.queue.review} /><Row label="Blocked" value={data?.queue.blocked} /></dl><Link href={data?.queue.href ?? "/content/x?view=content"} className="mt-4 inline-flex items-center gap-1 text-xs font-semibold text-brand">Contentを開く<ArrowRight className="h-3.5 w-3.5" /></Link></section>;
}

function Attention({ data }: { data: XDashboardData | null }) {
  return <section className="rounded-2xl border border-hairline bg-ink-card p-5"><SectionTitle eyebrow="X only">Attention</SectionTitle><div className="mt-4 space-y-2">{!data?.attention.length && <p className="text-xs text-sub">要対応なし</p>}{data?.attention.map((item) => <div key={`${item.id}:${item.title}`} className="rounded-lg border border-loss/20 bg-loss/5 p-3"><div className="flex gap-2 text-xs font-semibold text-loss"><AlertTriangle className="h-4 w-4 shrink-0" />{item.title}</div>{item.detail && <p className="mt-1 break-words text-[11px] text-sub">{item.detail}</p>}</div>)}</div></section>;
}

function TopContent({ data }: { data: XDashboardData | null }) {
  const [ranking, setRanking] = useState<Ranking>("impressions");
  const available = useMemo(() => data?.availableRankings ?? [], [data]);
  useEffect(() => { if (available.length && !available.includes(ranking)) setRanking(available[0]); }, [available, ranking]);
  const sorted = useMemo(() => [...(data?.topContent ?? [])].sort((a, b) => rankingValue(b, ranking) - rankingValue(a, ranking)).slice(0, 3), [data, ranking]);
  return <section className="rounded-2xl border border-hairline bg-ink-card p-5"><div className="flex flex-wrap items-center justify-between gap-3"><SectionTitle eyebrow="Best performers">Top Content</SectionTitle><div className="flex gap-1 overflow-x-auto">{available.map((item) => <button type="button" key={item} onClick={() => setRanking(item)} className={`shrink-0 rounded-lg px-2.5 py-1.5 text-[11px] ${ranking === item ? "bg-brand text-white" : "bg-white/5 text-sub"}`}>{item[0].toUpperCase() + item.slice(1)}</button>)}</div></div>
    {!sorted.length ? <Empty label="DATA UNAVAILABLE" /> : <div className="mt-4 grid gap-3 md:grid-cols-3">{sorted.map((item) => <article key={item.id} className="rounded-xl border border-hairline bg-white/[0.02] p-4"><p className="line-clamp-3 text-sm leading-6 text-white">「{item.excerpt}」</p><dl className="mt-4 space-y-1 text-xs"><Row label="Impressions" value={item.impressions} /><Row label="Replies" value={item.replies} /><Row label="Profile Visits" value={item.profileVisits} /><Row label="Clicks" value={item.linkClicks} /></dl><p className="mt-3 text-[11px] text-sub">Published {formatTime(item.publishedAt)}</p></article>)}</div>}
  </section>;
}

function Learning({ data, compact = false }: { data: XDashboardData | null; compact?: boolean }) {
  const xPolicy = platformBrandPolicy("x"); const learning = data?.learning;
  return <section className="rounded-2xl border border-hairline bg-ink-card p-5 sm:p-6"><div className="flex items-start gap-3"><BrainCircuit className="mt-0.5 h-5 w-5 text-brand" /><div><SectionTitle eyebrow="相関・仮説">AI Learning</SectionTitle><p className="mt-1 text-xs text-sub">Evidence {learning?.evidenceCount ?? "—"} ・ Confidence {learning?.confidence ?? "—"}</p></div></div>
    {learning?.observations.length ? <ul className="mt-4 space-y-2">{learning.observations.map((item) => <li key={item} className="rounded-xl border border-hairline bg-white/[0.02] p-3 text-sm text-slate-200">→ {item}。高いPerformanceと関連している可能性があります。</li>)}</ul> : <Empty label={learning?.status ?? "DATA UNAVAILABLE"} />}
    <div className="mt-4 rounded-xl border border-brand/20 bg-brand/5 p-4"><p className="text-xs font-semibold text-brand">Next Experiment</p><p className="mt-1 text-sm text-white">{learning?.nextExperiment ?? "—"}</p></div>
    {!compact && <details className="mt-5 rounded-xl border border-hairline p-4"><summary className="cursor-pointer text-sm font-semibold text-white">X Platform Policy</summary><p className="mt-3 text-xs leading-5 text-sub">{xPolicy.positioning}</p><div className="mt-3 flex flex-wrap gap-2">{xPolicy.pillars.map((pillar) => <span key={pillar} className="rounded-full bg-white/5 px-2.5 py-1 text-[11px] text-slate-300">{pillar}</span>)}</div></details>}
    {data?.dataAsOf && <p className="mt-4 text-[11px] text-sub">最終更新 {new Date(data.dataAsOf).toLocaleString("ja-JP")}</p>}
  </section>;
}

function Revenue({ data }: { data: XDashboardData | null }) {
  return <section className="rounded-2xl border border-hairline bg-ink-card p-5 sm:p-6"><div className="flex items-center gap-3"><Wallet className="h-5 w-5 text-brand" /><SectionTitle eyebrow="Existing Revenue Ledger">Revenue</SectionTitle></div>
    {!data?.revenue.available ? <Empty label="Revenue data unavailable" /> : <><p className="mt-5 text-3xl font-bold text-white">¥{data.revenue.total?.toLocaleString() ?? "—"}</p><div className="mt-4 grid gap-3 sm:grid-cols-2">{Object.entries(data.revenue.byType).map(([type, amount]) => <Kpi key={type} label={type} value={`¥${amount.toLocaleString()}`} />)}</div></>}
  </section>;
}

function ContentStudio() {
  const [drafts, setDrafts] = useState<Draft[]>([]); const [materials, setMaterials] = useState<Material[]>([]);
  const [materialId, setMaterialId] = useState(""); const [draftType, setDraftType] = useState("opinion"); const [manualText, setManualText] = useState("");
  const [busy, setBusy] = useState(false); const [error, setError] = useState<string | null>(null);
  const load = () => { fetch("/api/content/x/drafts").then((response) => response.json()).then((data) => setDrafts(data.drafts ?? [])); fetch("/api/content/materials").then((response) => response.json()).then((data) => setMaterials(data.materials ?? [])); };
  useEffect(load, []);
  async function create() { setBusy(true); setError(null); try { await api("/api/content/x/drafts", "POST", { materialId: materialId || undefined, draftType, manualText: manualText || undefined }); setManualText(""); load(); } catch (cause) { setError(cause instanceof Error ? cause.message : "失敗しました"); } finally { setBusy(false); } }
  async function publish(draft: Draft) { const url = window.prompt("公開したXのURL（任意）") ?? ""; await api("/api/content/published", "POST", { channel: "x", contentId: draft.id, title: draft.text.slice(0, 40), url: url || undefined }); await api("/api/content/x/drafts", "PATCH", { id: draft.id, status: "published" }); load(); }
  return <div className="space-y-5"><section><div className="flex items-center gap-2"><FileText className="h-5 w-5 text-brand" /><h3 className="text-lg font-bold">X Content Studio</h3></div><p className="mt-1 text-sm text-sub">Material → Draft → Review → Published</p></section>
    <section className="rounded-2xl border border-hairline bg-ink-card p-4"><p className="text-sm font-semibold">新しいX下書き</p>{error && <p className="mt-2 rounded-lg border border-loss/30 bg-loss/10 px-3 py-2 text-xs text-loss">{error}</p>}<div className="mt-3 grid gap-2 sm:grid-cols-2"><select value={materialId} onChange={(event) => setMaterialId(event.target.value)} className="rounded-lg border border-hairline bg-white/[0.02] px-3 py-2 text-xs"><option value="">Materialを使わない（手動入力のみ）</option>{materials.map((material) => <option key={material.id} value={material.id}>{material.title}</option>)}</select><select value={draftType} onChange={(event) => setDraftType(event.target.value)} className="rounded-lg border border-hairline bg-white/[0.02] px-3 py-2 text-xs">{DRAFT_TYPES.map((item) => <option key={item} value={item}>{item}</option>)}</select></div><textarea value={manualText} onChange={(event) => setManualText(event.target.value)} placeholder="手動で投稿文を書く場合はここに（空ならMaterialからAIが生成します）" rows={3} className="mt-2 w-full rounded-lg border border-hairline bg-white/[0.02] p-2 text-xs" /><button type="button" onClick={() => void create()} disabled={busy || (!materialId && !manualText.trim())} className="mt-2 rounded-lg bg-brand px-3 py-2 text-xs font-semibold disabled:opacity-40">下書きを作る</button></section>
    <section className="rounded-2xl border border-hairline bg-ink-card p-4"><p className="text-sm font-semibold">下書き一覧</p><div className="mt-2 space-y-2">{drafts.length === 0 && <p className="text-xs text-sub">まだありません。</p>}{drafts.map((draft) => <div key={draft.id} className="rounded-lg border border-hairline bg-white/[0.02] p-3 text-xs"><div className="mb-1 flex items-center justify-between"><span className="rounded bg-white/5 px-1.5 py-0.5 text-[9px] text-sub">{draft.draftType ?? "—"} / {draft.status}</span>{draft.sourceNoteArticleId && <span className="text-[9px] text-sub">note記事から生成</span>}</div><p className="whitespace-pre-wrap">{draft.text}</p>{draft.status !== "published" && <button type="button" onClick={() => void publish(draft)} className="mt-2 rounded-lg bg-gain/20 px-3 py-1.5 text-gain">公開記録を作成</button>}</div>)}</div></section>
  </div>;
}

function RangeSelector({ value, onChange }: { value: XDashboardRange; onChange: (value: XDashboardRange) => void }) { return <div className="flex rounded-lg bg-white/5 p-1">{(Object.keys(RANGE_LABELS) as XDashboardRange[]).map((item) => <button type="button" key={item} onClick={() => onChange(item)} className={`rounded-md px-3 py-1.5 text-[11px] ${value === item ? "bg-white/10 text-white" : "text-sub"}`}>{RANGE_LABELS[item]}</button>)}</div>; }
function SectionTitle({ eyebrow, children }: { eyebrow: string; children: ReactNode }) { return <div><p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-sub">{eyebrow}</p><h3 className="mt-1 text-base font-semibold text-white">{children}</h3></div>; }
function Kpi({ label, value }: { label: string; value: string }) { return <div className="min-w-0 rounded-xl border border-hairline bg-white/[0.02] p-3"><p className="truncate text-[10px] uppercase tracking-wide text-sub">{label}</p><p className="mt-2 break-words text-xl font-bold text-white">{value}</p></div>; }
function Row({ label, value }: { label: string; value: number | null | undefined }) { return <div className="flex items-center justify-between gap-3"><dt className="text-sub">{label}</dt><dd className="font-semibold text-white">{value === null || value === undefined ? "—" : value.toLocaleString()}</dd></div>; }
function Empty({ label }: { label: string }) { return <p className="mt-4 rounded-xl border border-dashed border-hairline p-4 text-center text-xs text-sub">{label}</p>; }
function formatNumber(value: number | null | undefined, loading = false) { if (loading) return "…"; return value === null || value === undefined ? "—" : Math.round(value).toLocaleString(); }
function formatTime(value: string) { const date = new Date(value); return Number.isNaN(date.getTime()) ? "—" : date.toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" }); }
function rankingValue(item: XDashboardData["topContent"][number], ranking: Ranking) { if (ranking === "impressions") return item.impressions ?? -1; if (ranking === "engagement") return item.engagement ?? -1; if (ranking === "traffic") return (item.profileVisits ?? 0) + (item.linkClicks ?? 0); return item.revenue ?? -1; }
