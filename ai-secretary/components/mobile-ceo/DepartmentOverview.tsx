"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { BUSINESS_DEPARTMENT_NAV, KNOWLEDGE_NAV, type NavigationDepartmentId } from "@/app/lib/config/navigation";

type Card = { id: NavigationDepartmentId; status: "active" | "attention" | "unknown"; currentWork: string[]; problems: string[] };
type DepartmentMap = Partial<Record<NavigationDepartmentId, Card>>;
type HomeSummary = { approvals: { pendingCount: number }; departments: Card[] };
type Attention = { id: string; title: string; href: string };
type ConnectionHealth = { services?: Array<{ service: string; label: string; status: string; message?: string }> };

function statusOf(model: Card | undefined) {
  if (model?.status === "attention") return { label: "要確認", tone: "bg-amber-400" };
  if (model?.status === "active") return { label: "稼働中", tone: "bg-emerald-400" };
  return { label: "未確認", tone: "bg-slate-500" };
}

export function DepartmentOverview() {
  const [departments, setDepartments] = useState<DepartmentMap>({});
  const [approvals, setApprovals] = useState<Attention[]>([]);
  const [systemAttention, setSystemAttention] = useState<Attention[]>([]);
  const [summaryUnavailable, setSummaryUnavailable] = useState(false);
  const [connectionsUnavailable, setConnectionsUnavailable] = useState(false);

  useEffect(() => {
    let active = true;
    void fetch("/api/company/home-summary").then(async (response) => {
      if (!response.ok) throw new Error("HOME_SUMMARY_UNAVAILABLE");
      return response.json() as Promise<HomeSummary>;
    }).then((payload) => {
      if (!active) return;
      setDepartments(Object.fromEntries(payload.departments.map((card) => [card.id, card])));
      const count = payload.approvals.pendingCount;
      setApprovals(count ? [{ id: "approvals", title: `承認待ち ${count}件`, href: "/ceo/approvals" }] : []);
      setSummaryUnavailable(false);
    }).catch(() => { if (active) setSummaryUnavailable(true); });

    void fetch("/api/system/connections").then((response) => response.ok ? response.json() as Promise<ConnectionHealth> : null).then((payload) => {
      if (!active) return;
      if (!payload) { setConnectionsUnavailable(true); return; }
      setConnectionsUnavailable(false);
      const critical = (payload.services ?? []).filter((service) => ["disconnected", "error"].includes(service.status));
      setSystemAttention(critical.slice(0, 1).map((service) => ({ id: `system-${service.service}`, title: service.message ?? `${service.label}の接続に問題があります`, href: "/connections" })));
    }).catch(() => { if (active) setConnectionsUnavailable(true); });
    return () => { active = false; };
  }, []);

  const attention = useMemo(() => {
    const departmentAttention = BUSINESS_DEPARTMENT_NAV.flatMap((item) => {
      const model = departments[item.id];
      if (!model) return [];
      return model.problems.slice(0, 1).map((problem, index) => ({ id: `${item.id}-problem-${index}`, title: `${item.label}: ${problem}`, href: item.href }));
    });
    return [...approvals, ...departmentAttention, ...systemAttention].slice(0, 5);
  }, [approvals, departments, systemAttention]);
  const currentWork = useMemo(() => BUSINESS_DEPARTMENT_NAV.flatMap((item) => (departments[item.id]?.currentWork ?? []).slice(0, 1).map((title) => ({ id: `${item.id}:${title}`, title, label: item.label, href: item.href }))).slice(0, 3), [departments]);

  return (
    <div className="space-y-7">
      <section aria-labelledby="ceo-attention-title">
        <div className="flex items-center justify-between gap-3">
          <h2 id="ceo-attention-title" className="text-base font-semibold text-white">CEO Attention</h2>
          <span className="text-sm font-semibold text-amber-300">{attention.length}</span>
        </div>
        {summaryUnavailable ? <p className="mt-3 text-sm text-slate-400">ホームの集計を取得できません。各部署を開いて確認してください。</p> : null}
        {connectionsUnavailable ? <p className="mt-3 text-sm text-slate-400">接続状態は未確認です。</p> : null}
        {attention.length > 0 ? (
          <ul className="mt-3 space-y-2">
            {attention.map((item) => <li key={item.id}><Link href={item.href} className="flex min-h-11 items-center rounded-xl border border-amber-500/25 bg-amber-500/[0.07] px-3 py-2 text-sm text-amber-100">{item.title}</Link></li>)}
          </ul>
        ) : null}
      </section>

      {currentWork.length ? <section aria-labelledby="current-work-title"><h2 id="current-work-title" className="text-base font-semibold text-white">現在の仕事</h2><ul className="mt-3 space-y-2">{currentWork.map((item) => <li key={item.id}><Link href={item.href} className="flex min-h-11 items-center justify-between rounded-xl border border-slate-800 bg-slate-900/65 px-3 py-2 text-sm"><span className="truncate">{item.title}</span><span className="ml-3 shrink-0 text-xs text-slate-500">{item.label}</span></Link></li>)}</ul></section> : null}

      <section aria-labelledby="departments-title">
        <h2 id="departments-title" className="text-base font-semibold text-white">事業部</h2>
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {BUSINESS_DEPARTMENT_NAV.map((item) => {
            const model = departments[item.id];
            const status = statusOf(model);
            const alertCount = model?.problems.length ?? 0;
            return (
              <Link key={item.id} href={item.href} className="min-w-0 rounded-2xl border border-slate-800 bg-slate-900/65 p-4 transition hover:border-violet-500/50 hover:bg-slate-900">
                <h3 className="text-base font-semibold text-white"><span aria-hidden>{item.icon}</span> {item.label}</h3>
                <p className="mt-1 text-sm text-slate-400">{item.description}</p>
                <div className="mt-4 flex items-center justify-between gap-3 text-xs text-slate-400"><p className="flex items-center gap-2"><span className={`h-2 w-2 rounded-full ${status.tone}`} aria-hidden />{status.label}</p>{alertCount > 0 ? <p className="text-amber-300">判断待ち {alertCount}</p> : null}</div>
              </Link>
            );
          })}
        </div>
      </section>
      <section aria-labelledby="knowledge-title">
        <h2 id="knowledge-title" className="text-base font-semibold text-white">全社共有基盤</h2>
        <Link href={KNOWLEDGE_NAV.href} className="mt-3 flex min-h-16 items-center justify-between rounded-2xl border border-violet-500/25 bg-violet-500/[0.07] p-4"><span><strong>{KNOWLEDGE_NAV.icon} {KNOWLEDGE_NAV.label}</strong><span className="mt-1 block text-sm text-slate-400">{KNOWLEDGE_NAV.description}</span></span><span aria-hidden>→</span></Link>
      </section>
    </div>
  );
}
