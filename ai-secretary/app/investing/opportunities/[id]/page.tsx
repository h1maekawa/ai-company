"use client";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import type { InvestmentOpportunity, MarketRegime } from "@/app/lib/investing/intelligence/types";
import { InvestingShell } from "@/components/investing/Shell";
import { Card, CardHeader, EmptyState, Skeleton } from "@/components/investing/ui";

export default function OpportunityDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [data, setData] = useState<{ opportunity: InvestmentOpportunity; marketRegime: MarketRegime } | null>();
  const [notice, setNotice] = useState("");
  useEffect(() => { fetch(`/api/investing/opportunities/${encodeURIComponent(id)}`).then((response) => response.ok ? response.json() : null).then(setData).catch(() => setData(null)); }, [id]);
  async function decide(decision: "GO" | "WAIT" | "PASS") { setNotice("保存中…"); const response = await fetch(`/api/investing/opportunities/${encodeURIComponent(id)}/decision`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ decision, scenario: "BASE", reason: "AI Company Opportunity Detailから本人が判断" }) }); setNotice(response.ok ? `${decision}として判断履歴へ保存しました` : "保存に失敗しました"); }
  if (data === undefined) return <InvestingShell title="Opportunity"><Skeleton className="h-96" /></InvestingShell>;
  if (!data) return <InvestingShell title="Opportunity"><Card><EmptyState title="Opportunityが見つかりません" /></Card></InvestingShell>;
  const item = data.opportunity;
  return <InvestingShell title={`${item.ticker} · ${item.gate}`}>
    <div className="grid gap-3 pb-24 xl:grid-cols-3"><div className="space-y-3 xl:col-span-2">
      <Card><div className="flex items-start justify-between gap-3"><div><p className="text-xs text-sub">{item.theme}</p><h2 className="mt-1 text-2xl font-bold">{item.ticker} <span className="text-sm font-normal text-sub">{item.name}</span></h2><p className="mt-2 text-sm text-slate-300">{item.whyNow}</p></div><div className="text-right"><p className="text-3xl font-bold">{item.score ?? "—"}</p><p className="text-[10px] text-sub">Coverage {item.scoreCoverage}%</p></div></div>{item.gate === "DATA_INCOMPLETE" ? <p className="mt-3 rounded-xl border border-loss/30 bg-loss/10 p-3 text-xs text-loss">Evidence不足のためGO候補へ昇格しません：{item.missingData.join(" / ")}</p> : null}</Card>
      <Card><CardHeader title="Score Breakdown" hint="Scoreだけでは結論を出しません" /><div className="grid gap-2 sm:grid-cols-2">{item.breakdown.map((factor) => <div key={factor.key} className="rounded-xl border border-hairline p-3"><div className="flex justify-between text-xs"><span>{factor.label}</span><strong>{factor.score === null ? "未取得" : `${factor.score}/${factor.weight}`}</strong></div><p className="mt-1 text-[10px] text-sub">{factor.reason}</p></div>)}</div></Card>
      <Card><CardHeader title="Bull / Base / Bear" />{item.scenarios.length === 0 ? <div className="rounded-xl border border-loss/30 bg-loss/10 p-3 text-xs text-loss"><strong>DATA INCOMPLETE</strong><p className="mt-1">Scenarioを作成するEvidenceが不足しています</p></div> : <div className="grid gap-2 md:grid-cols-3">{item.scenarios.map((scenario) => <article key={scenario.kind} className="rounded-xl border border-hairline p-3 text-xs"><strong>{scenario.kind}</strong><p className="mt-2 text-sub">Trigger: {scenario.trigger}</p><p className="mt-1 text-sub">Watch: {scenario.whatToWatch}</p><p className="mt-1 text-sub">Invalidation: {scenario.invalidation}</p></article>)}</div>}</Card>
    </div><div className="space-y-3"><Card><CardHeader title="Portfolio Impact" /><p className="text-sm">{item.portfolioImpact}</p><p className="mt-2 text-xs text-brand">{item.portfolioAction}</p></Card><Card><CardHeader title="Evidence / Source / Freshness" />{item.evidence.length ? <ul className="space-y-2">{item.evidence.map((evidence) => <li key={evidence.id} className="text-xs"><p>{evidence.fact}</p><p className="mt-1 text-[10px] text-sub">{evidence.sourceName} · {evidence.freshness} · {evidence.publishedAt ?? "日時不明"}</p></li>)}</ul> : <p className="text-xs text-loss">Evidenceなし</p>}</Card></div></div>
    <div className="fixed inset-x-0 bottom-0 z-40 border-t border-hairline bg-ink-base/95 p-3 backdrop-blur lg:left-56"><div className="mx-auto flex max-w-3xl gap-2">{(["GO", "WAIT", "PASS"] as const).map((decision) => <button key={decision} type="button" onClick={() => void decide(decision)} className="min-h-11 flex-1 rounded-xl border border-hairline bg-ink-card text-sm font-semibold hover:border-brand/50">{decision === "GO" ? "GO候補として保存" : decision}</button>)}</div>{notice ? <p className="mt-1 text-center text-[10px] text-sub">{notice}</p> : null}</div>
  </InvestingShell>;
}
