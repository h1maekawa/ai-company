"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AlertTriangle, ArrowRight, CheckCircle2, ShieldAlert } from "lucide-react";
import type { IntelligenceToday, OpportunityGate } from "@/app/lib/investing/intelligence/types";
import { Card, CardHeader, EmptyState, Skeleton } from "./ui";

const GATE_LABEL: Record<OpportunityGate, string> = { GO_CANDIDATE: "GO候補", WAIT: "WAIT", PASS: "PASS", DATA_INCOMPLETE: "DATA INCOMPLETE" };
const GATE_STYLE: Record<OpportunityGate, string> = { GO_CANDIDATE: "text-gain border-gain/30 bg-gain/10", WAIT: "text-warning border-warning/30 bg-warning/10", PASS: "text-sub border-hairline bg-white/[0.03]", DATA_INCOMPLETE: "text-loss border-loss/30 bg-loss/10" };

export function IntelligenceTodayPanel() {
  const [today, setToday] = useState<IntelligenceToday | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => { fetch("/api/investing/intelligence/today").then((response) => response.json()).then((data) => setToday(data.today ?? null)).catch(() => setToday(null)).finally(() => setLoading(false)); }, []);
  if (loading) return <Skeleton className="mb-4 h-80 rounded-2xl" />;
  if (!today) return <Card><EmptyState icon={<ShieldAlert className="h-7 w-7" />} title="Investment Intelligenceはまだありません" description="日次Intelligence Cron実行後に、Evidenceに基づく市場・機会情報を表示します。" /></Card>;

  const go = today.opportunities.filter((item) => item.gate === "GO_CANDIDATE").slice(0, 3);
  const wait = today.opportunities.filter((item) => item.gate === "WAIT" || item.gate === "DATA_INCOMPLETE").slice(0, 5);
  return (
    <div className="mb-5 space-y-3">
      <Card>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div><p className="text-[10px] font-semibold tracking-[0.16em] text-sub">MARKET REGIME</p><p className={`mt-1 text-2xl font-bold ${today.marketRegime === "RISK_ON" ? "text-gain" : today.marketRegime === "RISK_OFF" ? "text-loss" : "text-warning"}`}>{today.marketRegime.replace("_", " ")}</p></div>
          <span className="text-[10px] text-sub">{new Date(today.asOf).toLocaleString("ja-JP")}</span>
        </div>
        <p className="mt-3 text-sm leading-relaxed text-slate-300">{today.summary}</p>
        {today.marketEvidence.length === 0 ? <p className="mt-2 inline-flex items-center gap-1 text-xs text-loss"><AlertTriangle className="h-3.5 w-3.5" />市場Evidence未取得。GO候補は停止中です。</p> : <p className="mt-2 inline-flex items-center gap-1 text-xs text-gain"><CheckCircle2 className="h-3.5 w-3.5" />市場Evidence {today.marketEvidence.length}件</p>}
      </Card>
      <div className="grid gap-3 lg:grid-cols-2">
        <OpportunityList title="今日のGO候補" items={go} empty="Evidence条件を満たすGO候補はありません" />
        <OpportunityList title="WAIT / 要データ" items={wait} empty="WAIT候補はありません" />
      </div>
      {today.portfolioAlerts.length > 0 ? <Card><CardHeader title="Portfolio Alert" hint="保有株への重要変化" /><ul className="space-y-2">{today.portfolioAlerts.map((alert) => <li key={`${alert.ticker}-${alert.message}`} className="rounded-xl border border-warning/25 bg-warning/5 p-3 text-xs"><strong className="text-warning">{alert.ticker}</strong><span className="ml-2 text-slate-300">{alert.message}</span></li>)}</ul></Card> : null}
    </div>
  );
}

function OpportunityList({ title, items, empty }: { title: string; items: IntelligenceToday["opportunities"]; empty: string }) {
  return <Card><CardHeader title={title} hint={`${items.length}件`} />{items.length === 0 ? <p className="text-xs text-sub">{empty}</p> : <ul className="space-y-2">{items.map((item) => <li key={item.id}><Link href={`/investing/opportunities/${encodeURIComponent(item.id)}`} className="flex items-center gap-3 rounded-xl border border-hairline p-3 hover:border-brand/40"><span className={`rounded-lg border px-2 py-1 text-[10px] font-semibold ${GATE_STYLE[item.gate]}`}>{GATE_LABEL[item.gate]}</span><span className="min-w-0 flex-1"><strong className="block text-sm">{item.ticker} <span className="font-normal text-sub">{item.theme}</span></strong><span className="block truncate text-[11px] text-sub">{item.whyNow}</span></span><span className="text-sm font-bold tabular-nums">{item.score ?? "—"}</span><ArrowRight className="h-4 w-4 text-sub" /></Link></li>)}</ul>}</Card>;
}
