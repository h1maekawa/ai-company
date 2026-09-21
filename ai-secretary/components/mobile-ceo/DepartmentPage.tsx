"use client";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import type { DepartmentId, DepartmentMetric, DepartmentReadModel, DepartmentDirectiveDraft } from "@/app/lib/mobile-ceo/departments";
import { PageState, Section } from "./MobilePrimitives";

function MetricCard({ item }: { item: DepartmentMetric }) { return <div className="min-w-0 rounded-xl border border-slate-800 bg-slate-950/60 p-3"><div className="text-xs text-slate-400">{item.label}</div><div className="mt-1 break-words text-lg font-bold">{item.displayValue ?? (item.value === null ? "UNKNOWN" : `${item.value.toLocaleString("ja-JP")}${item.unit ?? ""}`)}</div><div className="mt-1 text-[10px] text-slate-500">{item.availability} · {item.source}</div>{item.asOf && <div className="mt-1 text-[10px] text-slate-600">as of {item.asOf}</div>}</div>; }

export function DepartmentPage({ id }: { id: DepartmentId }) {
  const [model, setModel] = useState<DepartmentReadModel | null>(null); const [error, setError] = useState(""); const [draft, setDraft] = useState<DepartmentDirectiveDraft | null>(null); const [message, setMessage] = useState("");
  const load = useCallback(async () => { try { const response = await fetch(`/api/company/departments/${id}`); if (!response.ok) throw new Error(); setModel((await response.json()).department); setError(""); } catch { setError("Department KPIを取得できませんでした"); } }, [id]);
  useEffect(() => { void load(); }, [load]);
  async function createDraft(event: FormEvent<HTMLFormElement>) { event.preventDefault(); const form = new FormData(event.currentTarget); const response = await fetch("/api/company/directives/draft", { method:"POST", headers:{"content-type":"application/json"}, body:JSON.stringify({ department:id, instruction:String(form.get("instruction") ?? ""), goal:String(form.get("goal") ?? ""), priority:form.get("priority") }) }); const payload = await response.json(); if (!response.ok) setMessage(payload.error); else { setDraft(payload.directive); setMessage(""); } }
  async function approve() { if (!draft || !window.confirm("このDirectiveを人間CEOとして承認し、既存WorkflowへRoutingしますか？")) return; const response = await fetch("/api/company/directives/approve", { method:"POST", headers:{"content-type":"application/json", "idempotency-key":crypto.randomUUID()}, body:JSON.stringify({ draftId:draft.id, confirmedByHuman:true }) }); const payload = await response.json(); setMessage(response.ok ? `承認・Routing完了: ${payload.route}` : payload.error); if (response.ok) setDraft(null); }
  if (!model && !error) return <PageState>読み込み中…</PageState>;
  if (!model) return <PageState retry={() => void load()}>{error}</PageState>;
  return <div className="space-y-4">
    <Section title="North Star KPI"><MetricCard item={model.northStar}/></Section>
    <Section title="Outcome KPIs"><div className="grid grid-cols-2 gap-2">{model.outcomes.map((item) => <MetricCard key={item.metric} item={item}/>)}</div></Section>
    <Section title="Operation KPIs"><div className="grid grid-cols-2 gap-2">{model.operations.map((item) => <MetricCard key={item.metric} item={item}/>)}</div></Section>
    <Section title="Current Work">{model.currentWork.length ? <ul className="space-y-2 text-sm">{model.currentWork.map((item) => <li key={item} className="rounded-lg bg-slate-800 p-3">{item}</li>)}</ul> : <p className="text-sm text-slate-400">確認できる進行中データはありません。</p>}</Section>
    <Section title="Problems / Blocked">{model.problems.length ? <ul className="space-y-2 text-sm text-amber-200">{model.problems.map((item) => <li key={item}>{item}</li>)}</ul> : <p className="text-sm text-slate-400">確認済みのBlocked情報はありません。</p>}</Section>
    <Section title="AI Suggestions">{model.suggestions.length ? model.suggestions.map((item) => <div key={item.suggestion} className="space-y-1 text-sm"><p><b>Observation:</b> {item.observation}</p><p><b>AI interpretation:</b> {item.interpretation}</p><p><b>Suggestion:</b> {item.suggestion}</p></div>) : <p className="text-sm text-slate-400">根拠のある提案はありません。</p>}</Section>
    <Section title="この事業部に指示する"><form onSubmit={createDraft} className="space-y-3"><textarea name="instruction" required placeholder="自然文で指示" className="min-h-28 w-full rounded-xl border border-slate-700 bg-slate-950 p-3"/><input name="goal" placeholder="Goal（任意）" className="min-h-11 w-full rounded-xl border border-slate-700 bg-slate-950 px-3"/><select name="priority" defaultValue="B" className="min-h-11 w-full rounded-xl border border-slate-700 bg-slate-950 px-3"><option>A</option><option>B</option><option>C</option></select><button className="min-h-11 w-full rounded-xl bg-violet-600 font-semibold">Directive Draftを確認</button></form>
      {draft && <div className="mt-4 rounded-xl border border-violet-700 bg-violet-950/30 p-3 text-sm"><p className="font-bold">AI interpretation — 編集前Preview</p><dl className="mt-2 space-y-1"><div>Department: {draft.department}</div><div>Instruction: {draft.instruction}</div><div>Priority: {draft.priority}</div><div>Target KPI: {draft.targetMetric?.metric ?? "未指定"}</div><div>External Action: {draft.interpretation.externalAction ? "あり" : "なし"}</div><div>Risk: {draft.interpretation.risk}</div><div>Mission Type: {draft.interpretation.suggestedMissionType}</div></dl><button type="button" onClick={() => void approve()} className="mt-3 min-h-11 w-full rounded-xl bg-emerald-700 font-semibold">人間CEOとして承認してRouting</button></div>}
      {message && <p role="status" className="mt-3 text-sm text-amber-200">{message}</p>}
    </Section>
    {model.executionAuthority === "HUMAN_ONLY" && <p className="rounded-xl border border-amber-800 p-3 text-xs text-amber-300">HUMAN_ONLY — AIによる証券注文・自動売買は禁止</p>}
  </div>;
}
