"use client";

import Link from "next/link";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { DEPARTMENT_NAV_BY_ID } from "@/app/lib/config/navigation";
import type { DepartmentId, DepartmentMetric, DepartmentReadModel, DepartmentDirectiveDraft } from "@/app/lib/mobile-ceo/departments";
import { formatMetricValue } from "@/app/lib/mobile-ceo/controlCenter";
import { CreatorDepartmentControl } from "./CreatorDepartmentControl";
import { DepartmentChat } from "./DepartmentChat";
import type { DepartmentResearchPayload } from "./DepartmentResearchSummary";
import { EmployeeWorkspace } from "./EmployeeWorkspace";
import { EngineeringWorkerControl } from "./EngineeringWorkerControl";
import { FundDepartmentControl } from "./FundDepartmentControl";
import { PageState, Section } from "./MobilePrimitives";

function MetricCard({ item }: { item: DepartmentMetric }) {
  return <div className="min-w-0 rounded-xl border border-slate-800 bg-slate-950/60 p-3"><div className="text-xs text-slate-400">{item.label}</div><div className="mt-1 break-words text-lg font-bold">{formatMetricValue(item)}</div><div className="mt-1 text-[10px] text-slate-500">{item.availability === "UNKNOWN" ? "未取得" : item.availability} · {item.source}</div>{item.asOf ? <div className="mt-1 text-[10px] text-slate-600">as of {item.asOf}</div> : null}</div>;
}

function DirectiveComposer({ id, label, initialInstruction }: { id: DepartmentId; label: string; initialInstruction: string }) {
  const [instruction, setInstruction] = useState(initialInstruction);
  const [draft, setDraft] = useState<DepartmentDirectiveDraft | null>(null);
  const [message, setMessage] = useState("");
  useEffect(() => { if (initialInstruction) setInstruction(initialInstruction); }, [initialInstruction]);

  async function createDraft(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const response = await fetch("/api/company/directives/draft", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ department: id, instruction, goal: String(form.get("goal") ?? ""), priority: form.get("priority") }) });
    const payload = await response.json();
    if (!response.ok) setMessage(payload.error); else { setDraft(payload.directive); setMessage(""); }
  }
  async function approve() {
    if (!draft || !window.confirm("このDirectiveを人間CEOとして承認し、既存WorkflowへRoutingしますか？")) return;
    const response = await fetch("/api/company/directives/approve", { method: "POST", headers: { "content-type": "application/json", "idempotency-key": crypto.randomUUID() }, body: JSON.stringify({ draftId: draft.id, confirmedByHuman: true }) });
    const payload = await response.json(); setMessage(response.ok ? "承認し、担当へRoutingしました。" : payload.error); if (response.ok) { setDraft(null); setInstruction(""); }
  }
  return <section aria-labelledby="directive-title" className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4"><h2 id="directive-title" className="text-base font-bold">⚡ {label}に指示する</h2><p className="mt-1 text-xs text-slate-400">質問とは別です。Previewと人間確認後にのみMissionへRoutingします。</p><form onSubmit={createDraft} className="mt-3 space-y-3"><textarea value={instruction} onChange={(event) => setInstruction(event.target.value)} required placeholder="実行してほしい内容" className="min-h-28 w-full rounded-xl border border-slate-700 bg-slate-950 p-3"/><input name="goal" placeholder="Goal（任意）" className="min-h-11 w-full rounded-xl border border-slate-700 bg-slate-950 px-3"/><select name="priority" defaultValue="B" className="min-h-11 w-full rounded-xl border border-slate-700 bg-slate-950 px-3"><option>A</option><option>B</option><option>C</option></select><button className="min-h-11 w-full rounded-xl bg-violet-600 font-semibold">Directive Draftを確認</button></form>{draft ? <div className="mt-4 rounded-xl border border-violet-700 bg-violet-950/30 p-3 text-sm"><p className="font-bold">実行前Preview</p><p className="mt-2 whitespace-pre-wrap">{draft.instruction}</p><p className="mt-2 text-xs text-slate-400">Risk: {draft.interpretation.risk} · External Action: {draft.interpretation.externalAction ? "あり" : "なし"}</p><button type="button" onClick={() => void approve()} className="mt-3 min-h-11 w-full rounded-xl bg-emerald-700 font-semibold">人間CEOとして承認</button></div> : null}{message ? <p role="status" className="mt-3 text-sm text-amber-200">{message}</p> : null}</section>;
}

type ResearchPayload = Omit<DepartmentResearchPayload, "items"> & { items: Array<{ id: string; topic: string; title: string; summary: string; freshnessStatus: string; reliability: string; sourceName?: string; fetchedAt: string }> | null };

function WorkflowList({ model }: { model: DepartmentReadModel }) {
  return <div className="space-y-2 text-sm">{model.workflows?.map((workflow) => <details key={workflow.id} className="rounded-xl border border-slate-700 bg-slate-900 p-3"><summary className="min-h-11 cursor-pointer"><strong className="block">{workflow.title}</strong><span className="text-xs text-slate-400">{workflow.completed} / {workflow.total} Step完了 · {workflow.status}</span></summary><ol className="mt-3 space-y-2">{workflow.steps.map((step) => <li key={step.id} className="rounded-lg bg-slate-950 p-2"><div className="flex justify-between gap-2"><span>{step.title}</span><span>{step.status}</span></div><p className="mt-1 text-xs text-slate-500">担当: {step.assignedAgentId ?? "未取得"} · Depends on: {step.dependsOn.join(", ") || "なし"}</p><p className="mt-1 break-all text-[10px] text-slate-600">Inputs: {step.inputRefs.join(", ") || "なし"}<br/>Outputs: {step.outputRefs.join(", ") || "なし"}<br/>Knowledge: {step.knowledgeRefs.join(", ") || "なし"}</p></li>)}</ol></details>)}</div>;
}

function ResearchList({ research }: { research: ResearchPayload | null }) {
  return research?.items?.length ? <div className="space-y-2">{research.items.slice(-5).reverse().map((item)=><details key={item.id} className="rounded-xl border border-slate-700 bg-slate-900 p-3"><summary className="min-h-11 cursor-pointer"><strong>{item.topic}</strong><span className="mt-1 block text-xs text-slate-400">{item.title} · {item.freshnessStatus} · {item.reliability}</span></summary><p className="mt-2 text-xs text-slate-300">{item.summary}</p><p className="mt-2 text-[10px] text-slate-500">Source: {item.sourceName??"未取得"} · Fetched: {item.fetchedAt}</p></details>)}</div> : <p className="text-sm text-slate-400">Research: {research?.health?.[0]?.status && research.health[0].status !== "UNKNOWN" ? research.health[0].status : "未取得"}。取得済みの実データはありません。</p>;
}

export function DepartmentPage({ id }: { id: DepartmentId }) {
  const navigation = DEPARTMENT_NAV_BY_ID[id];
  const [model, setModel] = useState<DepartmentReadModel | null>(null);
  const [error, setError] = useState("");
  const [directiveSeed, setDirectiveSeed] = useState("");
  const [research, setResearch] = useState<ResearchPayload|null>(null);
  const load = useCallback(async () => { try { const [response,researchResponse] = await Promise.all([fetch(`/api/company/departments/${id}`),fetch(`/api/company/research?departmentId=${encodeURIComponent(id)}`)]); if (!response.ok) throw new Error(); setModel((await response.json()).department); setResearch(researchResponse.ok?await researchResponse.json():null); setError(""); } catch { setError("部門データを取得できませんでした"); } }, [id]);
  useEffect(() => { void load(); }, [load]);
  if (!model && !error) return <PageState>読み込み中…</PageState>;
  if (!model) return <PageState retry={() => void load()}>{error}</PageState>;
  const important = [model.northStar, ...model.outcomes].slice(0, 3);
  const detailLink = <Link href={navigation.detailHref} className="flex min-h-11 items-center justify-center rounded-xl border border-slate-700 text-sm text-violet-300">{id === "creator" ? "詳細分析を開く" : "詳細を見る"}</Link>;
  const humanOnly = model.executionAuthority === "HUMAN_ONLY" ? <p className="rounded-xl border border-amber-800 p-3 text-xs text-amber-300">HUMAN_ONLY — AIによる証券注文・自動売買は禁止</p> : null;
  const conversation = <><DepartmentChat id={id} label={navigation.label} onDirective={setDirectiveSeed}/><DirectiveComposer id={id} label={navigation.label} initialInstruction={directiveSeed}/></>;

  // Creator / Fund は「CEOが判断する」Control Center。詳細・対話は「その他」へ下げる。
  if (id === "creator" || id === "fund") return <div className="space-y-4">
    {id === "creator" ? <CreatorDepartmentControl model={model} research={research}/> : <FundDepartmentControl model={model} research={research}/>}
    <Section title="その他">
      <div className="space-y-3">
        <details open={Boolean(model.workflows?.length)} className="rounded-xl border border-slate-800 p-3"><summary className="min-h-11 cursor-pointer py-2 text-sm font-semibold">現在の仕事</summary>{model.workflows?.length ? <WorkflowList model={model}/> : model.currentWork.length ? <ul className="space-y-2 text-sm">{model.currentWork.map((item) => <li key={item} className="rounded-lg bg-slate-800 p-3">{item}</li>)}</ul> : <p className="text-sm text-slate-400">実行中のMission / Workflowはありません。</p>}</details>
        {model.opportunities?.length ? <details className="rounded-xl border border-slate-800 p-3"><summary className="min-h-11 cursor-pointer py-2 text-sm font-semibold">事業機会（担当Missionではありません）</summary><ul className="space-y-2 text-sm">{model.opportunities.map((item) => <li key={item} className="rounded-lg bg-slate-900 p-3 text-slate-300">{item}</li>)}</ul></details> : null}
        <details className="rounded-xl border border-slate-800 p-3"><summary className="min-h-11 cursor-pointer py-2 text-sm font-semibold">詳細KPI</summary><div className="grid grid-cols-2 gap-2">{[...model.outcomes, ...model.operations].map((item) => <MetricCard key={item.metric} item={item}/>)}</div></details>
        <details className="rounded-xl border border-slate-800 p-3"><summary className="min-h-11 cursor-pointer py-2 text-sm font-semibold">最新Research（本文）</summary><ResearchList research={research}/></details>
        {conversation}
      </div>
    </Section>
    {detailLink}
    {humanOnly}
  </div>;

  return <div className="space-y-4">
    {id === "engineering" ? <EngineeringWorkerControl /> : null}
    {model.problems.length ? <Section title="確認事項"><ul className="space-y-2 text-sm text-amber-200">{model.problems.map((item) => <li key={item}>{item}</li>)}</ul></Section> : null}
    {model.workflows?.length || model.currentWork.length ? <Section title="現在の仕事"><WorkflowList model={model}/>{model.currentWork.length ? <div className="mt-2 space-y-2 text-sm">{model.currentWork.map((item) => <div key={item} className="rounded-lg bg-slate-800 p-3">{item}</div>)}</div> : null}</Section> : null}
    <EmployeeWorkspace departmentId={id}/>
    <Section title="最新Research"><ResearchList research={research}/></Section>
    <Section title="必要なKPI"><div className="grid grid-cols-1 gap-2 sm:grid-cols-3">{important.map((item) => <MetricCard key={item.metric} item={item}/>)}</div><details className="mt-3"><summary className="min-h-11 cursor-pointer py-3 text-sm text-violet-300">詳細を見る</summary><div className="grid grid-cols-2 gap-2">{model.operations.map((item) => <MetricCard key={item.metric} item={item}/>)}</div></details></Section>
    {model.suggestions.length ? <Section title="AIからの提案">{model.suggestions.map((item) => <div key={item.suggestion} className="space-y-1 text-sm"><p>{item.observation}</p><p className="text-slate-400">{item.interpretation}</p><p>{item.suggestion}</p></div>)}</Section> : null}
    {conversation}
    {detailLink}
    {humanOnly}
  </div>;
}
