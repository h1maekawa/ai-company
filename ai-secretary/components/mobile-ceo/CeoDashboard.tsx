"use client";

import { useCallback, useEffect, useState } from "react";
import { buildCeoReadModel, type CeoSourcePayloads } from "@/app/lib/mobile-ceo/readModel";
import { PageState, Section, UnknownValue } from "./MobilePrimitives";

const sources: Array<[keyof CeoSourcePayloads, string]> = [
  ["dashboard", "/api/company/dashboard"], ["approvals", "/api/company/approvals"],
  ["opportunities", "/api/company/opportunities"], ["content", "/api/content/dashboard?period=month"],
  ["recommendations", "/api/fund/recommendations"], ["decisions", "/api/fund/decisions"],
  ["transactions", "/api/fund/transactions"], ["engineering", "/api/engineering/requests"],
];

export function CeoDashboard() {
  const [data, setData] = useState<CeoSourcePayloads | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => {
    setError(null);
    const settled = await Promise.all(sources.map(async ([key, url]) => {
      try { const response = await fetch(url); return [key, response.ok ? await response.json() : null] as const; }
      catch { return [key, null] as const; }
    }));
    const next = Object.fromEntries(settled) as CeoSourcePayloads;
    if (settled.every(([, value]) => value === null)) setError("Control Towerを読み込めませんでした");
    setData(next);
  }, []);
  useEffect(() => { void load(); }, [load]);
  if (!data) return <PageState>読み込み中…</PageState>;
  if (error) return <PageState retry={() => void load()}>{error}</PageState>;
  const model = buildCeoReadModel(data);
  return <div className="space-y-4">
    <div className="grid grid-cols-2 gap-3">
      {model.metrics.map((metric) => <div key={metric.label} className="min-w-0 rounded-2xl border border-slate-800 bg-slate-900/70 p-3">
        <div className="text-xs text-slate-400">{metric.label}</div>
        <div className="mt-1 break-words text-xl font-bold"><UnknownValue value={metric.value} /></div>
      </div>)}
    </div>
    <Section title="CEO Attention" href="/ceo/approvals">
      {model.attention.length === 0 ? <p className="text-sm text-slate-400">現在、緊急の確認事項はありません。</p> :
        <ul className="space-y-2">{model.attention.map((item) => <li key={item.id}><a href={item.href} className="block min-h-11 rounded-xl bg-slate-800 px-3 py-3 text-sm">{item.title}</a></li>)}</ul>}
    </Section>
    <Section title="Creator" href="/content">
      <div className="grid grid-cols-3 gap-2 text-center text-sm"><div>機会<br/><UnknownValue value={model.creator.opportunities}/></div><div>公開<br/><UnknownValue value={model.creator.published}/></div><div>収益<br/><UnknownValue value={model.creator.revenueYen} unit="円"/></div></div>
    </Section>
    <Section title="Fund Intelligence" href="/investing">
      <p className="text-sm">最新候補: {model.fund.recommendation?.action ?? "UNKNOWN"}</p>
      <p className="mt-2 text-xs font-semibold text-amber-300">HUMAN_ONLY — AIによる注文・自動売買は禁止</p>
    </Section>
    <Section title="Engineering" href="/admin">
      <p className="text-sm">対象: <UnknownValue value={model.engineering.items}/></p>
      {!model.engineering.available && <p className="mt-2 text-xs text-slate-400">GitHub状態はUNKNOWNです。</p>}
    </Section>
  </div>;
}
