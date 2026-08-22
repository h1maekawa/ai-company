"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowRight, AlertTriangle } from "lucide-react";
import { HUB_NODES, hubNodeHref } from "@/app/lib/config/hub";

type Health = { services: { service: string; label: string; status: string; message?: string }[]; healthy: number; total: number };
const cardIds = ["morning", "note", "content", "fund", "kakei"];

export default function HomePage() {
  const [health, setHealth] = useState<Health | null>(null);
  const departments = [
    ...HUB_NODES.filter((node) => cardIds.includes(node.id)).map((node) => ({ ...node, href: hubNodeHref(node) })),
    { id: "knowledge", icon: "🧠", name: "Knowledge", tagline: "会社の知識を検索・確認", color: "#8b5cf6", href: "/knowledge" },
  ];
  useEffect(() => { fetch("/api/system/connections").then((r) => r.ok ? r.json() : null).then(setHealth).catch(() => setHealth(null)); }, []);
  const alerts = health?.services.filter((service) => ["warning", "disconnected"].includes(service.status)) ?? [];
  return <main className="mx-auto min-h-screen max-w-6xl px-5 py-16 sm:px-8 lg:py-10"><header><p className="text-sm font-medium text-violet-300">AI Company</p><h1 className="mt-2 text-3xl font-bold tracking-tight text-white">今日はどの事業部を開きますか？</h1></header><section className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{departments.map((node) => <Link key={node.id} href={node.href} className="group rounded-2xl border border-slate-800 bg-slate-900/65 p-5 transition hover:-translate-y-0.5 hover:border-violet-500/50 hover:bg-slate-900"><div className="flex items-start justify-between"><span className="text-3xl">{node.icon}</span><ArrowRight className="h-4 w-4 text-slate-600 group-hover:text-violet-300" /></div><h2 className="mt-5 font-semibold text-white">{node.name}</h2><p className="mt-1 text-sm text-slate-400">{node.tagline}</p></Link>)}</section><section className="mt-10 rounded-2xl border border-slate-800 bg-slate-900/55 p-5"><div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-widest text-slate-500">System Health</p><p className="mt-1 text-xl font-semibold text-white">{health ? `${health.healthy} / ${health.total} 正常` : "取得中…"}</p></div><Link href="/connections" className="text-sm text-violet-300 hover:text-violet-200">Connectionsを開く →</Link></div>{health && <div className="mt-4 flex flex-wrap gap-2">{health.services.map((service) => <span key={service.service} className="rounded-full bg-slate-950/70 px-3 py-1.5 text-xs text-slate-300"><span className={service.status === "connected" ? "text-emerald-400" : service.status === "warning" ? "text-amber-400" : "text-slate-500"}>●</span> {service.label}</span>)}</div>}{alerts.length > 0 && <div className="mt-4 flex items-start gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-200"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /><div><strong>System Alert</strong><p className="mt-0.5 text-xs text-amber-200/80">{alerts[0].message ?? `${alerts[0].label}を確認してください`}</p></div></div>}</section></main>;
}
