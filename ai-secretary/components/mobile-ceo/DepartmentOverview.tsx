"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { BUSINESS_DEPARTMENT_NAV, DEPARTMENT_NAV, KNOWLEDGE_NAV, type NavigationDepartmentId } from "@/app/lib/config/navigation";
import type { DepartmentReadModel } from "@/app/lib/mobile-ceo/departments";
import { UNKNOWN_LABEL } from "@/app/lib/mobile-ceo/controlCenter";

type DepartmentMap = Partial<Record<NavigationDepartmentId, DepartmentReadModel | null>>;
type Attention = { id: string; title: string; href: string };
type ConnectionHealth = { services?: Array<{ service: string; label: string; status: string; message?: string }> };

function allMetrics(model: DepartmentReadModel) {
  return [model.northStar, ...model.outcomes, ...model.operations];
}

function statusOf(model: DepartmentReadModel | null | undefined) {
  if (!model) return { label: UNKNOWN_LABEL, tone: "bg-slate-500" };
  const decisionRequired = model.operations.find((metric) => metric.metric === "decision_required")?.value ?? 0;
  const ciFailure = model.operations.concat(model.outcomes).find((metric) => metric.metric === "ci_failure")?.value ?? 0;
  if (model.problems.length > 0 || decisionRequired > 0 || ciFailure > 0) return { label: "要確認", tone: "bg-amber-400" };
  if (model.currentWork.length > 0) return { label: "稼働中", tone: "bg-emerald-400" };
  return { label: "正常", tone: "bg-sky-400" };
}

export function DepartmentOverview() {
  const [departments, setDepartments] = useState<DepartmentMap>({});
  const [approvals, setApprovals] = useState<Attention[]>([]);
  const [systemAttention, setSystemAttention] = useState<Attention[]>([]);

  useEffect(() => {
    let active = true;
    void Promise.all(DEPARTMENT_NAV.map(async (item) => {
      try {
        const response = await fetch(`/api/company/departments/${item.id}`);
        return [item.id, response.ok ? (await response.json()).department as DepartmentReadModel : null] as const;
      } catch { return [item.id, null] as const; }
    })).then((entries) => { if (active) setDepartments(Object.fromEntries(entries)); });

    void fetch("/api/company/approvals").then((response) => response.ok ? response.json() : null).then((payload) => {
      if (!active || !payload) return;
      const pending = Array.isArray(payload.pending) ? payload.pending : [];
      setApprovals(pending.length ? [{ id: "approvals", title: `承認待ち ${pending.length}件`, href: "/ceo/approvals" }] : []);
    }).catch(() => undefined);

    void fetch("/api/system/connections").then((response) => response.ok ? response.json() as Promise<ConnectionHealth> : null).then((payload) => {
      if (!active || !payload) return;
      const critical = (payload.services ?? []).filter((service) => ["disconnected", "error"].includes(service.status));
      setSystemAttention(critical.slice(0, 1).map((service) => ({ id: `system-${service.service}`, title: service.message ?? `${service.label}の接続に問題があります`, href: "/connections" })));
    }).catch(() => undefined);
    return () => { active = false; };
  }, []);

  const attention = useMemo(() => {
    const departmentAttention = DEPARTMENT_NAV.flatMap((item) => {
      const model = departments[item.id];
      if (!model) return [];
      const decision = model.operations.find((metric) => metric.metric === "decision_required" && metric.value !== null && metric.value > 0);
      const ciFailure = model.outcomes.find((metric) => metric.metric === "ci_failure" && metric.value !== null && metric.value > 0);
      // Thesis Alert は Thesis の実データ（WEAKENED / INVALIDATED）だけ。株価下落では出さない。
      const thesis = model.operations.find((metric) => metric.metric === "thesis_alerts" && metric.value !== null && metric.value > 0);
      return [
        ...(decision ? [{ id: `${item.id}-decision`, title: `${item.label}: 判断待ち ${decision.value}件`, href: item.href }] : []),
        ...(thesis ? [{ id: `${item.id}-thesis`, title: `${item.label}: Thesis Alert ${thesis.value}件`, href: item.href }] : []),
        ...(ciFailure ? [{ id: `${item.id}-ci`, title: `${item.label}: CI失敗 ${ciFailure.value}件`, href: item.href }] : []),
        ...model.problems.slice(0, 1).map((problem, index) => ({ id: `${item.id}-problem-${index}`, title: `${item.label}: ${problem}`, href: item.href })),
      ];
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
            const alertCount = model ? model.problems.length + allMetrics(model).filter((metric) => ["decision_required", "thesis_alerts", "ci_failure", "blocked"].includes(metric.metric) && (metric.value ?? 0) > 0).reduce((sum, metric) => sum + (metric.value ?? 0), 0) : 0;
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
