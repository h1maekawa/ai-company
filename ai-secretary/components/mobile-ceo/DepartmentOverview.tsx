"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { DEPARTMENT_NAV_BY_ID, type NavigationDepartmentId } from "@/app/lib/config/navigation";

type Card = { id: NavigationDepartmentId; status: "active" | "attention" | "unknown"; currentWork: string[]; problems: string[] };
type Attention = { id: string; title: string; href: string; source: string; priority: "critical" | "high" | "normal"; order?: number };
type HomeSummary = { generatedAt: string; unavailable?: string[]; departments: Card[]; attention: Attention[]; yesterday: { date: string; facts: string[] } };
type ConnectionHealth = { services?: Array<{ service: string; label: string; status: string; message?: string }> };
type Employee = { id: string; name: string; role: string; status: string; currentMissionTitle?: string; currentStep?: { title: string }; skills?: { name: string }[] };

const STATUS_IDS: NavigationDepartmentId[] = ["creator", "fund", "operations", "engineering", "knowledge"];
const priorityText = { critical: "緊急", high: "優先", normal: "確認" };
const priorityRank = { critical: 0, high: 1, normal: 2 };

function statusOf(model?: Card) {
  if (model?.status === "attention") return { label: "要確認", tone: "bg-amber-400" };
  if (model?.status === "active") return { label: "稼働中", tone: "bg-emerald-400" };
  return { label: "未取得", tone: "bg-slate-500" };
}

export function DepartmentOverview() {
  const [summary, setSummary] = useState<HomeSummary | null>(null);
  const [summaryError, setSummaryError] = useState(false);
  const [connectionAttention, setConnectionAttention] = useState<Attention[]>([]);
  const [connectionError, setConnectionError] = useState(false);
  const [connectionsLoaded, setConnectionsLoaded] = useState(false);
  const [selected, setSelected] = useState<NavigationDepartmentId>("creator");
  const [employees, setEmployees] = useState<Employee[] | null>(null);
  const [employeesError, setEmployeesError] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    void fetch("/api/company/home-summary", { signal: controller.signal, cache: "no-store" })
      .then((response) => { if (!response.ok) throw new Error("HOME_SUMMARY_UNAVAILABLE"); return response.json() as Promise<HomeSummary>; })
      .then(setSummary)
      .catch(() => { if (!controller.signal.aborted) setSummaryError(true); });
    void fetch("/api/system/connections", { signal: controller.signal })
      .then((response) => { if (!response.ok) throw new Error("CONNECTIONS_UNAVAILABLE"); return response.json() as Promise<ConnectionHealth>; })
      .then((value) => { setConnectionsLoaded(true); setConnectionAttention((value.services ?? [])
        .filter((service) => ["disconnected", "error"].includes(service.status))
        .map((service) => ({ id: `connection:${service.service}`, title: service.message || `${service.label}の接続に問題があります`, href: "/connections", source: service.label, priority: "high" }))); })
      .catch(() => { if (!controller.signal.aborted) setConnectionError(true); });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    setEmployees(null);
    setEmployeesError(false);
    void fetch(`/api/company/departments/${selected}/employees`, { signal: controller.signal })
      .then((response) => { if (!response.ok) throw new Error("EMPLOYEES_UNAVAILABLE"); return response.json() as Promise<{ employees?: Employee[] }>; })
      .then((value) => setEmployees(value.employees ?? []))
      .catch(() => { if (!controller.signal.aborted) setEmployeesError(true); });
    return () => controller.abort();
  }, [selected]);

  const cards = new Map(summary?.departments.map((card) => [card.id, card]) ?? []);
  const attention = [...(summary?.attention ?? []), ...connectionAttention].sort((a, b) => (a.order ?? (a.priority === "critical" ? 0 : 5)) - (b.order ?? (b.priority === "critical" ? 0 : 5)) || priorityRank[a.priority] - priorityRank[b.priority]);
  const selectedDepartment = DEPARTMENT_NAV_BY_ID[selected];

  return <div className="space-y-8">
    <p role="status" className="text-sm text-slate-300">{summaryError ? "● 状態を確認できません" : !summary || !connectionsLoaded && !connectionError ? "● 状態を確認中です" : attention.length ? `● ${attention.length}件確認が必要です` : summary.unavailable?.length ? "● 一部の確認事項は未取得です" : connectionError ? "● 接続状態は未取得です" : "● 確認が必要な項目はありません"}</p>
    <section aria-labelledby="attention-title">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div><h2 id="attention-title" className="text-xl font-semibold text-white">確認が必要</h2><p className="mt-1 text-sm text-slate-400">判断や対応が必要な項目だけ表示します。</p></div>
        <span className="text-sm text-slate-400">{summary ? `${attention.length}件` : "集計中"}</span>
      </div>
      {(summaryError || Boolean(summary?.unavailable?.length)) && <p role="status" className="mt-3 text-sm text-amber-200">{summary?.unavailable?.join("・")}の確認事項を取得できません。しばらくしてから再読み込みしてください。</p>}
      {connectionError && <p role="status" className="mt-2 text-sm text-slate-400">接続状態は未取得です。</p>}
      {attention.length ? <ul className="mt-4 flex snap-x gap-3 overflow-x-auto pb-3" aria-label="確認が必要な項目">
        {attention.map((item) => <li key={item.id} className="w-[min(78vw,17rem)] shrink-0 snap-start"><article className="flex h-full min-h-44 flex-col rounded-2xl border border-amber-400/25 bg-amber-400/[0.06] p-4">
          <div className="flex items-center justify-between gap-2 text-xs"><span className="text-amber-200">{item.source}</span><span className="rounded-full border border-amber-400/30 px-2 py-0.5 text-amber-200">{priorityText[item.priority]}</span></div>
          <h3 className="mt-3 line-clamp-3 flex-1 font-semibold text-white">{item.title}</h3>
          <Link href={item.href} className="mt-4 flex min-h-11 items-center justify-center rounded-xl bg-amber-300 px-3 text-sm font-semibold text-slate-950 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-200">確認する</Link>
        </article></li>)}
      </ul> : summary && !summary.unavailable?.length && connectionsLoaded && !connectionError ? <p className="mt-4 rounded-2xl border border-emerald-500/20 bg-emerald-500/[0.05] p-4 text-sm text-emerald-200">現在、確認が必要な項目はありません。</p> : null}
    </section>

    <section aria-labelledby="status-title"><h2 id="status-title" className="text-xl font-semibold text-white">現在の状況</h2><p className="mt-1 text-sm text-slate-400">カードを選ぶとチームの状態を表示します。</p>
      <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-5">
        {STATUS_IDS.map((id) => { const item = DEPARTMENT_NAV_BY_ID[id]; const model = cards.get(id); const status = statusOf(model); return <div key={id} className={`min-w-0 rounded-2xl border bg-slate-900/65 p-3 ${selected === id ? "border-violet-400" : "border-slate-800"}`}>
          <button type="button" onClick={() => setSelected(id)} aria-pressed={selected === id} className="min-h-14 w-full text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-violet-300"><span className="block font-semibold text-white"><span aria-hidden>{item.icon}</span> {item.label}</span><span className="mt-2 flex items-center gap-2 text-xs text-slate-300"><span className={`h-2 w-2 rounded-full ${status.tone}`} aria-hidden />{status.label}</span></button>
          <p className="mt-2 truncate text-xs text-slate-400">{model?.currentWork[0] ?? (model?.problems[0] || "活動情報は未取得")}</p>
          <Link href={id === "creator" ? item.detailHref : item.href} className="mt-3 inline-flex min-h-11 items-center text-xs font-semibold text-violet-200 underline-offset-4 hover:underline">{id === "creator" ? "事業ダッシュボード" : "詳細を見る"}</Link>
        </div>; })}
      </div>
    </section>

    <section aria-labelledby="team-title"><div className="flex items-center justify-between gap-3"><h2 id="team-title" className="text-lg font-semibold text-white">{selectedDepartment.label}チーム</h2><Link href={selectedDepartment.href} className="text-sm text-violet-200 underline-offset-4 hover:underline">部署の詳細</Link></div>
      {employeesError && <p role="status" className="mt-3 text-sm text-slate-400">メンバーの状態は未取得です。</p>}
      {employees === null && !employeesError && <p className="mt-3 text-sm text-slate-400">読み込み中…</p>}
      {employees?.length === 0 && <p className="mt-3 text-sm text-slate-400">登録済みメンバーは見つかりませんでした。</p>}
      {employees && employees.length > 0 && <ul className="mt-3 grid gap-3 sm:grid-cols-2">{employees.map((employee) => <li key={employee.id} className="rounded-xl border border-slate-800 bg-slate-900/60 p-4"><div className="flex items-start justify-between gap-3"><div><h3 className="font-medium text-white">{employee.name}</h3><p className="text-xs text-slate-400">{employee.role}</p></div><span className="text-xs text-slate-300">{employee.status || "UNKNOWN"}</span></div><p className="mt-3 text-sm text-slate-300">{employee.currentMissionTitle ?? "現在のMissionは未取得"}</p>{employee.currentStep?.title && <p className="mt-1 text-xs text-slate-400">現在のStep: {employee.currentStep.title}</p>}{employee.skills?.length ? <p className="mt-2 text-xs text-slate-500">Skills: {employee.skills.slice(0, 3).map((skill) => skill.name).join("、")}</p> : null}</li>)}</ul>}
    </section>

    <div className="grid gap-4 lg:grid-cols-2">
      <section id="yesterday-summary" aria-labelledby="assistant-title" className="rounded-2xl border border-slate-800 bg-slate-900/55 p-5"><h2 id="assistant-title" className="text-lg font-semibold text-white">AI Assistant</h2><p className="mt-1 text-sm text-slate-400">昨日の記録</p>
        {summary?.yesterday.facts.length ? <ul className="mt-4 space-y-2 text-sm text-slate-200">{summary.yesterday.facts.map((fact) => <li key={fact}>・{fact}</li>)}</ul> : <p className="mt-4 text-sm text-slate-400">昨日の活動記録は確認できませんでした。</p>}
        <div className="mt-5 flex flex-wrap gap-2"><a href="#yesterday-summary" className="inline-flex min-h-11 items-center rounded-xl border border-slate-700 px-3 text-sm text-slate-200">昨日の活動を見る</a><Link href="/chat?node=assistant" className="inline-flex min-h-11 items-center rounded-xl border border-violet-500/40 px-3 text-sm text-violet-200">今の状況を聞く</Link><Link href="/chat?node=assistant" className="inline-flex min-h-11 items-center rounded-xl border border-violet-500/40 px-3 text-sm text-violet-200">質問する</Link></div>
      </section>
      <section aria-labelledby="runtime-title" className="rounded-2xl border border-slate-800 bg-slate-900/55 p-5"><h2 id="runtime-title" className="text-lg font-semibold text-white">AIエージェント稼働状況</h2><p className="mt-1 text-sm text-slate-400">{selectedDepartment.label}チームの保存済み状態</p>
        {employees?.length ? <ul className="mt-4 space-y-3">{employees.map((employee) => <li key={employee.id} className="flex items-center justify-between gap-2 text-sm"><span className="truncate text-slate-200">{employee.name}</span><span className="shrink-0 text-slate-400">{employee.status || "UNKNOWN"}</span></li>)}</ul> : <p className="mt-4 text-sm text-slate-400">稼働状態は未取得です。</p>}
      </section>
    </div>
  </div>;
}
