"use client";

import Link from "next/link";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { DEPARTMENT_NAV_BY_ID } from "@/app/lib/config/navigation";
import type { DepartmentId, DepartmentMetric, DepartmentReadModel, DepartmentDirectiveDraft } from "@/app/lib/mobile-ceo/departments";
import { DepartmentChat } from "./DepartmentChat";
import { EmployeeWorkspace } from "./EmployeeWorkspace";
import { EngineeringWorkerControl } from "./EngineeringWorkerControl";
import { PageState, Section } from "./MobilePrimitives";

const CREATOR_OPERATION_LINKS = [
  {
    href: "/note",
    label: "コンテンツスタジオ",
    description: "今日の状況、投稿作成、確認、成果を見る",
  },
  {
    href: "/note?view=review",
    label: "投稿を確認",
    description: "X・noteの下書きを確認・修正・予約する",
  },
  {
    href: "/content",
    label: "詳細分析",
    description: "自動運用、投稿実績、Revenue、学びを見る",
  },
  {
    href: "/note/settings",
    label: "運用設定",
    description: "AUTOPILOT / REVIEW、Buffer、Research、ブランドを設定",
  },
] as const;

function CreatorQuickNavigation() {
  return (
    <Section title="Creatorメニュー">
      <nav aria-label="Creatorの主要画面" className="grid gap-3 sm:grid-cols-2">
        {CREATOR_OPERATION_LINKS.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="min-h-11 rounded-xl border border-slate-700 bg-slate-900 p-4 transition-colors hover:border-violet-500 hover:bg-slate-800"
          >
            <span className="block text-sm font-semibold text-violet-300">{item.label}</span>
            <span className="mt-1 block text-xs leading-relaxed text-slate-400">{item.description}</span>
          </Link>
        ))}
      </nav>
    </Section>
  );
}

function MetricCard({ item }: { item: DepartmentMetric }) {
  return <div className="min-w-0 rounded-xl border border-slate-800 bg-slate-950/60 p-3"><div className="text-xs text-slate-400">{item.label}</div><div className="mt-1 break-words text-lg font-bold">{item.displayValue ?? (item.value === null ? "UNKNOWN" : `${item.value.toLocaleString("ja-JP")}${item.unit ?? ""}`)}</div><div className="mt-1 text-[10px] text-slate-500">{item.availability} · {item.source}</div>{item.asOf ? <div className="mt-1 text-[10px] text-slate-600">as of {item.asOf}</div> : null}</div>;
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

export function DepartmentPage({ id }: { id: DepartmentId }) {
  const navigation = DEPARTMENT_NAV_BY_ID[id];
  const [model, setModel] = useState<DepartmentReadModel | null>(null);
  const [error, setError] = useState("");
  const [directiveSeed, setDirectiveSeed] = useState("");
  const [research, setResearch] = useState<{items:Array<{id:string;topic:string;title:string;summary:string;freshnessStatus:string;reliability:string;sourceName?:string;fetchedAt:string}>;health:Array<{status:string;lastSuccessfulRun:string|null;freshItemCount:number;staleItemCount:number}>}|null>(null);
  const load = useCallback(async () => { try { const [response,researchResponse] = await Promise.all([fetch(`/api/company/departments/${id}`),fetch(`/api/company/research?departmentId=${encodeURIComponent(id)}`)]); if (!response.ok) throw new Error(); setModel((await response.json()).department); setResearch(researchResponse.ok?await researchResponse.json():null); setError(""); } catch { setError("部門データを取得できませんでした"); } }, [id]);
  useEffect(() => { void load(); }, [load]);
  if (!model && !error) return <PageState>読み込み中…</PageState>;
  if (!model) return <PageState retry={() => void load()}>{error}</PageState>;
  const important = [model.northStar, ...model.outcomes].slice(0, 3);
  return <div className="space-y-4">
    {id === "creator" ? <CreatorQuickNavigation /> : null}
    {id === "engineering" ? <EngineeringWorkerControl /> : null}
    {model.problems.length ? <Section title="確認事項"><ul className="space-y-2 text-sm text-amber-200">{model.problems.map((item) => <li key={item}>{item}</li>)}</ul></Section> : null}
    {model.workflows?.length || model.currentWork.length ? <Section title="現在の仕事"><div className="space-y-2 text-sm">{model.workflows?.map((workflow) => <details key={workflow.id} className="rounded-xl border border-slate-700 bg-slate-900 p-3"><summary className="min-h-11 cursor-pointer"><strong className="block">{workflow.title}</strong><span className="text-xs text-slate-400">{workflow.completed} / {workflow.total} Step完了 · {workflow.status}</span></summary><ol className="mt-3 space-y-2">{workflow.steps.map((step) => <li key={step.id} className="rounded-lg bg-slate-950 p-2"><div className="flex justify-between gap-2"><span>{step.title}</span><span>{step.status}</span></div><p className="mt-1 text-xs text-slate-500">担当: {step.assignedAgentId ?? "UNKNOWN"} · Depends on: {step.dependsOn.join(", ") || "なし"}</p><p className="mt-1 break-all text-[10px] text-slate-600">Inputs: {step.inputRefs.join(", ") || "なし"}<br/>Outputs: {step.outputRefs.join(", ") || "なし"}<br/>Knowledge: {step.knowledgeRefs.join(", ") || "なし"}</p></li>)}</ol></details>)}{model.currentWork.map((item) => <div key={item} className="rounded-lg bg-slate-800 p-3">{item}</div>)}</div></Section> : null}
    <EmployeeWorkspace departmentId={id}/>
    <Section title="最新Research">{research?.items?.length?<div className="space-y-2">{research.items.slice(-5).reverse().map((item)=><details key={item.id} className="rounded-xl border border-slate-700 bg-slate-900 p-3"><summary className="min-h-11 cursor-pointer"><strong>{item.topic}</strong><span className="mt-1 block text-xs text-slate-400">{item.title} · {item.freshnessStatus} · {item.reliability}</span></summary><p className="mt-2 text-xs text-slate-300">{item.summary}</p><p className="mt-2 text-[10px] text-slate-500">Source: {item.sourceName??"UNKNOWN"} · Fetched: {item.fetchedAt}</p></details>)}</div>:<p className="text-sm text-slate-400">Research: {research?.health?.[0]?.status??"UNKNOWN"}。取得済みの実データはありません。</p>}</Section>
    <Section title="必要なKPI"><div className="grid grid-cols-1 gap-2 sm:grid-cols-3">{important.map((item) => <MetricCard key={item.metric} item={item}/>)}</div><details className="mt-3"><summary className="min-h-11 cursor-pointer py-3 text-sm text-violet-300">詳細を見る</summary><div className="grid grid-cols-2 gap-2">{model.operations.map((item) => <MetricCard key={item.metric} item={item}/>)}</div></details></Section>
    {model.suggestions.length ? <Section title="AIからの提案">{model.suggestions.map((item) => <div key={item.suggestion} className="space-y-1 text-sm"><p>{item.observation}</p><p className="text-slate-400">{item.interpretation}</p><p>{item.suggestion}</p></div>)}</Section> : null}
    <DepartmentChat id={id} label={navigation.label} onDirective={setDirectiveSeed}/>
    <DirectiveComposer id={id} label={navigation.label} initialInstruction={directiveSeed}/>
    <Link href={navigation.detailHref} className="flex min-h-11 items-center justify-center rounded-xl border border-slate-700 text-sm text-violet-300">{id === "creator" ? "詳細分析を開く" : "詳細を見る"}</Link>
    {model.executionAuthority === "HUMAN_ONLY" ? <p className="rounded-xl border border-amber-800 p-3 text-xs text-amber-300">HUMAN_ONLY — AIによる証券注文・自動売買は禁止</p> : null}
  </div>;
}
