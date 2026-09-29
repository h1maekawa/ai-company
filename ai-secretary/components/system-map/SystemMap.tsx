"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { SystemMapEdge, SystemMapNode, SystemMapStatus } from "@/app/lib/company/systemMapConfig";

type Metric = { key: string; label: string; displayValue?: string; value?: number | null; availability?: string; asOf?: string };
type Employee = { id: string; name: string; role: string; status: string; currentMissionTitle?: string; research?: { lastRun?: string; health?: string } };
type DepartmentData = { id: string; generatedAt: string | null; detail: { name: string; currentWork: string[]; problems: string[]; northStar?: Metric; outcomes?: Metric[]; operations?: Metric[]; executionAuthority?: string; aiExecutionAllowed?: boolean } | null; employees: Employee[] };
type Provider = { service: string; label: string; icon: string; status: string; message: string; lastCheckedAt: string; lastSuccessAt?: string; itemCount?: number };
type Cron = { id: string; label: string; path: string; schedule: string; timezone: string; source: string };
type Payload = { generatedAt: string; nodes: SystemMapNode[]; edges: SystemMapEdge[]; departments: DepartmentData[]; providers: Provider[]; crons: Cron[] };
type View = "overview" | "flow" | "automation";
type Selection = { kind: "node"; id: string } | { kind: "edge"; id: string } | null;

const STATUS_STYLE: Record<SystemMapStatus, string> = {
  CONNECTED: "border-emerald-500/30 bg-emerald-500/10 text-emerald-300", ACTIVE: "border-sky-500/30 bg-sky-500/10 text-sky-300",
  PARTIAL: "border-amber-500/30 bg-amber-500/10 text-amber-300", NOT_CONFIGURED: "border-slate-600 bg-slate-800 text-slate-400",
  ERROR: "border-rose-500/30 bg-rose-500/10 text-rose-300", UNKNOWN: "border-slate-600 bg-slate-800 text-slate-400",
  PLANNED: "border-violet-500/30 bg-violet-500/10 text-violet-300",
};
const EDGE_STYLE = { DATA: "text-cyan-300", RESEARCH: "text-violet-300", KNOWLEDGE: "text-fuchsia-300", MISSION: "text-blue-300", NOTIFICATION: "text-amber-300", EXTERNAL: "text-emerald-300", HUMAN_APPROVAL: "text-rose-300" } as const;

function providerStatus(status?: string): SystemMapStatus {
  if (status === "connected") return "CONNECTED";
  if (status === "warning") return "PARTIAL";
  if (status === "not_configured") return "NOT_CONFIGURED";
  if (status === "disconnected") return "ERROR";
  return "UNKNOWN";
}
function departmentStatus(department?: DepartmentData): SystemMapStatus {
  if (!department?.detail) return "UNKNOWN";
  if (department.detail.problems.length > 0) return "PARTIAL";
  if (department.detail.currentWork.length > 0) return "ACTIVE";
  return "CONNECTED";
}
const valueOf = (metric?: Metric) => metric?.displayValue ?? (metric?.value ?? "未取得");

export function SystemMap() {
  const [data, setData] = useState<Payload | null>(null);
  const [error, setError] = useState("");
  const [view, setView] = useState<View>("overview");
  const [showEmployees, setShowEmployees] = useState(false);
  const [selection, setSelection] = useState<Selection>(null);
  useEffect(() => { const controller = new AbortController(); fetch("/api/company/system-map", { signal: controller.signal }).then(async (response) => { if (!response.ok) throw new Error("System Mapを取得できません"); return response.json() as Promise<Payload>; }).then(setData).catch((reason) => { if (reason?.name !== "AbortError") setError(reason instanceof Error ? reason.message : "取得できません"); }); return () => controller.abort(); }, []);
  const departments = useMemo(() => new Map(data?.departments.map((department) => [department.id, department]) ?? []), [data]);
  const providers = useMemo(() => new Map(data?.providers.map((provider) => [provider.service, provider]) ?? []), [data]);
  const nodes = data?.nodes ?? [];
  const nodeIds = useMemo(() => new Set(nodes.map((node) => node.id)), [nodes]);
  const edges = useMemo(() => (data?.edges ?? []).filter((edge) => nodeIds.has(edge.from) && nodeIds.has(edge.to)), [data, nodeIds]);
  const selectedNode = selection?.kind === "node" ? nodes.find((node) => node.id === selection.id) : undefined;
  const selectedEdge = selection?.kind === "edge" ? edges.find((edge) => edge.id === selection.id) : undefined;

  const statusFor = (node: SystemMapNode): SystemMapStatus => {
    if (node.kind === "DEPARTMENT") return departmentStatus(departments.get(node.id));
    if (node.kind === "EXTERNAL_PROVIDER") return providerStatus(providers.get(node.id)?.status);
    return "ACTIVE";
  };

  return <main className="mx-auto min-h-screen max-w-7xl overflow-x-hidden px-4 py-6 sm:px-6 lg:px-8">
    <header className="flex flex-col gap-4 border-b border-slate-800 pb-5 lg:flex-row lg:items-end lg:justify-between">
      <div><Link href="/admin" className="text-xs text-violet-300">← 管理</Link><p className="mt-4 text-xs font-semibold uppercase tracking-[0.24em] text-violet-300">AI Company System Map</p><h1 className="mt-2 text-2xl font-bold text-white sm:text-3xl">データ・AI社員・Human Gateの全体像</h1><p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">実際のDepartment Read Model、Employee Registry、Execution State、Provider Healthを表示しています。取得不能な接続は正常扱いしません。</p></div>
      <div className="flex flex-wrap gap-2"><label className="flex min-h-11 items-center gap-2 rounded-xl border border-slate-700 px-3 text-xs text-slate-300"><input type="checkbox" checked={showEmployees} onChange={(event) => setShowEmployees(event.target.checked)} />AI社員を表示</label>{(["overview", "flow", "automation"] as View[]).map((item) => <button key={item} type="button" onClick={() => setView(item)} className={`min-h-11 rounded-xl border px-3 text-xs font-semibold ${view === item ? "border-violet-400 bg-violet-500/15 text-violet-200" : "border-slate-700 text-slate-400"}`}>{item === "overview" ? "Overview" : item === "flow" ? "Data Flow" : "Automation"}</button>)}</div>
    </header>
    {error ? <p className="mt-5 rounded-xl border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-300">{error}</p> : null}
    {!data && !error ? <div className="mt-6 h-64 animate-pulse rounded-2xl bg-slate-900" /> : null}
    {data ? <>
      {view === "overview" ? <Overview nodes={nodes} edges={edges} departments={departments} statusFor={statusFor} showEmployees={showEmployees} onSelect={(id) => setSelection({ kind: "node", id })} /> : null}
      {view === "flow" ? <DataFlow nodes={nodes} edges={edges} onSelectNode={(id) => setSelection({ kind: "node", id })} onSelectEdge={(id) => setSelection({ kind: "edge", id })} /> : null}
      {view === "automation" ? <Automation crons={data.crons} departments={data.departments} /> : null}
      <Legend />
      <p className="mt-4 text-right text-[11px] text-slate-600">Last updated {new Date(data.generatedAt).toLocaleString("ja-JP")}</p>
    </> : null}
    {selection ? <DetailPanel node={selectedNode} edge={selectedEdge} department={selectedNode ? departments.get(selectedNode.id) : undefined} provider={selectedNode ? providers.get(selectedNode.id) : undefined} status={selectedNode ? statusFor(selectedNode) : selectedEdge?.planned ? "PLANNED" : "ACTIVE"} onClose={() => setSelection(null)} /> : null}
  </main>;
}

function Overview({ nodes, edges, departments, statusFor, showEmployees, onSelect }: { nodes: SystemMapNode[]; edges: SystemMapEdge[]; departments: Map<string, DepartmentData>; statusFor: (node: SystemMapNode) => SystemMapStatus; showEmployees: boolean; onSelect: (id: string) => void }) {
  const external = nodes.filter((node) => node.kind === "EXTERNAL_PROVIDER"); const business = nodes.filter((node) => node.kind === "DEPARTMENT"); const shared = nodes.filter((node) => node.kind === "SHARED_PLATFORM" || node.kind === "SHARED_CORE" || node.kind === "HUMAN_GATE");
  return <section className="mt-6 space-y-5"><div className="rounded-2xl border border-violet-500/30 bg-gradient-to-br from-violet-500/15 to-slate-950 p-5 text-center"><p className="text-xs uppercase tracking-[0.25em] text-violet-300">Central Organization</p><h2 className="mt-2 text-xl font-bold text-white">AI Company</h2><p className="mt-1 text-xs text-slate-400">5 Departments · Shared Platforms · Human-controlled boundaries</p></div>
    {external.length ? <NodeSection title="External Sources / Actions" nodes={external} statusFor={statusFor} onSelect={onSelect} /> : null}
    <div><h2 className="mb-3 text-xs font-semibold uppercase tracking-widest text-slate-500">Departments</h2><div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">{business.map((node) => <DepartmentCard key={node.id} node={node} data={departments.get(node.id)} status={statusFor(node)} showEmployees={showEmployees} connections={edges.filter((edge) => edge.from === node.id || edge.to === node.id).length} onSelect={onSelect} />)}</div></div>
    <NodeSection title="Shared Platforms / Core / Human Gates" nodes={shared} statusFor={statusFor} onSelect={onSelect} />
  </section>;
}

function NodeSection({ title, nodes, statusFor, onSelect }: { title: string; nodes: SystemMapNode[]; statusFor: (node: SystemMapNode) => SystemMapStatus; onSelect: (id: string) => void }) { return <div><h2 className="mb-3 text-xs font-semibold uppercase tracking-widest text-slate-500">{title}</h2><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{nodes.map((node) => { const status = statusFor(node); return <button key={node.id} type="button" onClick={() => onSelect(node.id)} className="min-h-28 rounded-2xl border border-slate-800 bg-slate-900/65 p-4 text-left hover:border-violet-500/50"><div className="flex items-start justify-between gap-2"><span className="text-lg">{node.icon} <strong className="text-sm text-white">{node.label}</strong></span><Status value={status} /></div><p className="mt-3 text-xs leading-5 text-slate-400">{node.description}</p><p className="mt-2 text-[10px] uppercase tracking-wider text-slate-600">{node.kind.replaceAll("_", " ")}</p></button>; })}</div></div>; }

function DepartmentCard({ node, data, status, showEmployees, connections, onSelect }: { node: SystemMapNode; data?: DepartmentData; status: SystemMapStatus; showEmployees: boolean; connections: number; onSelect: (id: string) => void }) { const detail = data?.detail; const latestResearch = data?.employees.map((employee) => employee.research?.lastRun).filter(Boolean).sort().at(-1); return <button type="button" onClick={() => onSelect(node.id)} className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4 text-left hover:border-violet-500/50"><div className="flex items-start justify-between gap-2"><span><span className="mr-1">{node.icon}</span><strong className="text-sm text-white">{node.label}</strong></span><Status value={status} /></div>{node.humanOnly ? <p className="mt-2 inline-flex rounded-md border border-rose-500/30 px-2 py-1 text-[9px] font-bold text-rose-300">HUMAN_ONLY · {node.id === "fund" ? "NO AUTOMATIC TRADE" : "CONTROLLED"}</p> : null}<dl className="mt-3 grid grid-cols-3 gap-2 text-center"><Stat label="AI社員" value={data?.employees.length ?? "—"} /><Stat label="Mission" value={detail?.currentWork.length ?? "—"} /><Stat label="Problem" value={detail?.problems.length ?? "—"} /></dl><div className="mt-3 rounded-lg bg-slate-950/70 p-2"><p className="text-[10px] text-slate-500">主要KPI</p><p className="mt-1 truncate text-xs text-slate-200">{detail?.northStar?.label ?? "未取得"}: {valueOf(detail?.northStar)}</p></div><p className="mt-2 text-[10px] text-slate-500">Research {latestResearch ? new Date(latestResearch).toLocaleString("ja-JP") : "未取得"} · {connections} connections</p>{showEmployees ? <ul className="mt-3 space-y-1 border-t border-slate-800 pt-3">{data?.employees.map((employee) => <li key={employee.id} className="flex justify-between gap-2 text-[10px]"><span className="truncate text-slate-300">{employee.id}</span><span className="shrink-0 text-slate-500">{employee.status}</span></li>)}</ul> : null}</button>; }

function DataFlow({ nodes, edges, onSelectNode, onSelectEdge }: { nodes: SystemMapNode[]; edges: SystemMapEdge[]; onSelectNode: (id: string) => void; onSelectEdge: (id: string) => void }) { const names = new Map(nodes.map((node) => [node.id, node.label])); return <section className="mt-6"><div className="hidden grid-cols-[1fr_auto_1fr_auto_1fr] items-center gap-4 rounded-2xl border border-slate-800 bg-slate-950/50 p-6 lg:grid"><FlowColumn title="Sources" items={nodes.filter((node) => node.kind === "EXTERNAL_PROVIDER")} onSelect={onSelectNode} /><span className="text-slate-600">→</span><FlowColumn title="Shared Platforms" items={nodes.filter((node) => ["SHARED_PLATFORM", "SHARED_CORE"].includes(node.kind))} onSelect={onSelectNode} /><span className="text-slate-600">→</span><FlowColumn title="Departments / Human" items={nodes.filter((node) => ["DEPARTMENT", "HUMAN_GATE"].includes(node.kind))} onSelect={onSelectNode} /></div><div className="mt-4"><h2 className="mb-3 text-xs font-semibold uppercase tracking-widest text-slate-500">Connections</h2><div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">{edges.map((edge) => <button key={edge.id} type="button" onClick={() => onSelectEdge(edge.id)} className={`rounded-xl border p-3 text-left ${edge.planned ? "border-dashed border-violet-500/40" : "border-slate-800"}`}><p className="text-xs font-semibold text-white">{names.get(edge.from)} <span className="text-slate-600">→</span> {names.get(edge.to)}</p><p className={`mt-1 text-[10px] font-bold ${EDGE_STYLE[edge.type]}`}>{edge.type}{edge.planned ? " · PLANNED" : ""}</p><p className="mt-2 text-xs text-slate-400">{edge.purpose}</p></button>)}</div></div></section>; }
function FlowColumn({ title, items, onSelect }: { title: string; items: SystemMapNode[]; onSelect: (id: string) => void }) { return <div><h3 className="mb-3 text-center text-xs font-semibold uppercase tracking-widest text-slate-500">{title}</h3><div className="space-y-2">{items.map((node) => <button key={node.id} type="button" onClick={() => onSelect(node.id)} className="min-h-11 w-full rounded-xl border border-slate-800 bg-slate-900 px-3 text-sm text-slate-200">{node.icon} {node.label}</button>)}</div></div>; }

function Automation({ crons, departments }: { crons: Cron[]; departments: DepartmentData[] }) { const active = departments.flatMap((department) => department.detail?.currentWork.map((work) => ({ department: department.detail?.name ?? department.id, work })) ?? []); return <section className="mt-6 grid gap-5 lg:grid-cols-2"><div><h2 className="mb-3 text-xs font-semibold uppercase tracking-widest text-slate-500">Cron → Workflow → Artifact</h2><div className="space-y-2">{crons.map((cron) => <article key={cron.id} className="rounded-xl border border-slate-800 bg-slate-900/65 p-3"><div className="flex items-center justify-between gap-3"><strong className="text-sm text-white">{cron.label}</strong><code className="text-[10px] text-violet-300">{cron.schedule} UTC</code></div><p className="mt-1 text-[10px] text-slate-500">{cron.path} · {cron.source}</p></article>)}</div></div><div><h2 className="mb-3 text-xs font-semibold uppercase tracking-widest text-slate-500">Current Execution State</h2>{active.length ? <div className="space-y-2">{active.map((item) => <article key={`${item.department}:${item.work}`} className="rounded-xl border border-slate-800 p-3"><p className="text-xs text-violet-300">{item.department}</p><p className="mt-1 text-sm text-white">{item.work}</p></article>)}</div> : <p className="rounded-xl border border-slate-800 p-4 text-sm text-slate-500">現在実行中として取得できるMissionはありません。</p>}</div></section>; }

function DetailPanel({ node, edge, department, provider, status, onClose }: { node?: SystemMapNode; edge?: SystemMapEdge; department?: DepartmentData; provider?: Provider; status: SystemMapStatus; onClose: () => void }) { return <aside role="dialog" aria-modal="true" aria-label="System Map detail" className="fixed inset-x-0 bottom-0 z-50 max-h-[78vh] overflow-y-auto rounded-t-3xl border border-slate-700 bg-slate-950 p-5 shadow-2xl lg:inset-y-0 lg:left-auto lg:right-0 lg:max-h-none lg:w-[420px] lg:rounded-none"><div className="flex items-start justify-between gap-3"><div><p className="text-[10px] uppercase tracking-widest text-slate-500">{node?.kind ?? edge?.type}</p><h2 className="mt-1 text-xl font-bold text-white">{node ? `${node.icon} ${node.label}` : edge ? `${edge.from} → ${edge.to}` : "Detail"}</h2></div><button type="button" onClick={onClose} className="min-h-11 min-w-11 rounded-xl border border-slate-700 text-slate-300" aria-label="閉じる">×</button></div><div className="mt-4"><Status value={status} /></div>{node ? <><p className="mt-4 text-sm leading-6 text-slate-300">{node.description}</p>{department?.detail ? <><DetailSection title="Current Missions" items={department.detail.currentWork} empty="実行中Missionなし" /><DetailSection title="Problems" items={department.detail.problems} empty="Problemなし" /><DetailSection title="AI Employees" items={department.employees.map((employee) => `${employee.id} · ${employee.status}${employee.currentMissionTitle ? ` · ${employee.currentMissionTitle}` : ""}`)} empty="取得できません" /><DetailSection title="Input / Output" items={[`Input: Registry / Execution State / Department Read Model`, `Output: ${node.href ?? "内部Read Model"}`]} /></> : null}{provider ? <DetailSection title="Provider Health" items={[provider.message, `Last checked: ${new Date(provider.lastCheckedAt).toLocaleString("ja-JP")}`, `Last activity: ${provider.lastSuccessAt ? new Date(provider.lastSuccessAt).toLocaleString("ja-JP") : "不明"}`]} /> : null}{node.href ? <Link href={node.href} className="mt-5 flex min-h-11 items-center justify-center rounded-xl bg-violet-500 font-semibold text-white">画面を開く</Link> : null}</> : null}{edge ? <dl className="mt-5 space-y-4 text-sm"><DetailTerm label="Type" value={edge.type} /><DetailTerm label="Purpose" value={edge.purpose} /><DetailTerm label="Status" value={edge.planned ? "PLANNED" : "ACTIVE"} /><DetailTerm label="Source" value={edge.source} /></dl> : null}</aside>; }
function DetailSection({ title, items, empty }: { title: string; items: string[]; empty?: string }) { return <section className="mt-5"><h3 className="text-xs font-semibold uppercase tracking-widest text-slate-500">{title}</h3>{items.length ? <ul className="mt-2 space-y-2">{items.map((item, index) => <li key={`${item}:${index}`} className="rounded-lg bg-slate-900 p-3 text-xs leading-5 text-slate-300">{item}</li>)}</ul> : <p className="mt-2 text-xs text-slate-500">{empty}</p>}</section>; }
function DetailTerm({ label, value }: { label: string; value: string }) { return <div><dt className="text-xs text-slate-500">{label}</dt><dd className="mt-1 text-slate-200">{value}</dd></div>; }
function Status({ value }: { value: SystemMapStatus }) { return <span className={`inline-flex rounded-full border px-2 py-1 text-[9px] font-bold ${STATUS_STYLE[value]}`}>{value}</span>; }
function Stat({ label, value }: { label: string; value: string | number }) { return <div className="rounded-lg bg-slate-950/70 px-1 py-2"><dt className="text-[9px] text-slate-500">{label}</dt><dd className="mt-1 text-xs font-bold text-slate-200">{value}</dd></div>; }
function Legend() { return <section className="mt-6 rounded-xl border border-slate-800 p-3"><h2 className="text-[10px] font-semibold uppercase tracking-widest text-slate-500">Connection Legend</h2><div className="mt-2 flex flex-wrap gap-x-4 gap-y-2">{Object.entries(EDGE_STYLE).map(([type, style]) => <span key={type} className={`text-[10px] font-bold ${style}`}>━━ {type.replaceAll("_", " ")}</span>)}</div></section>; }
