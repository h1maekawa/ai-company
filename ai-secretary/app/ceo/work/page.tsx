"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { BUSINESS_DEPARTMENT_NAV, KNOWLEDGE_NAV } from "@/app/lib/config/navigation";
import type { DepartmentReadModel } from "@/app/lib/mobile-ceo/departments";

export default function CeoWorkPage() {
  const [departments, setDepartments] = useState<Partial<Record<string, DepartmentReadModel | null>>>({});
  useEffect(() => {
    let active = true;
    void Promise.all(BUSINESS_DEPARTMENT_NAV.map(async (item) => {
      try {
        const response = await fetch(`/api/company/departments/${item.id}`);
        return [item.id, response.ok ? (await response.json()).department as DepartmentReadModel : null] as const;
      } catch { return [item.id, null] as const; }
    })).then((entries) => { if (active) setDepartments(Object.fromEntries(entries)); });
    return () => { active = false; };
  }, []);
  return (
    <main className="mx-auto w-full max-w-3xl overflow-x-hidden px-4 py-5">
      <Link href="/" className="inline-flex min-h-11 items-center text-sm text-violet-300">← ホーム</Link>
      <h1 className="text-2xl font-bold">仕事</h1>
      <p className="mb-4 mt-1 text-sm text-slate-400">詳しく確認したい領域を選ぶ</p>
      <div className="space-y-3">
        {BUSINESS_DEPARTMENT_NAV.map((item) => {
          const model = departments[item.id];
          const alerts = model ? model.problems.length + [...model.outcomes, ...model.operations].filter((metric) => ["decision_required", "thesis_alerts", "ci_failure", "blocked"].includes(metric.metric)).reduce((sum, metric) => sum + (metric.value ?? 0), 0) : 0;
          const status = !model ? "未取得" : alerts > 0 ? "要確認" : model.currentWork.length > 0 ? "稼働中" : "正常";
          return <Link key={item.id} href={item.href} className="block min-h-16 rounded-2xl border border-slate-800 bg-slate-900/70 p-4"><strong>{item.icon} {item.label}</strong><span className="mt-1 block text-sm text-slate-400">{item.description}</span><span className="mt-3 flex items-center justify-between text-xs text-slate-500"><span>● {status}</span>{alerts > 0 ? <span className="text-amber-300">判断待ち {alerts}</span> : null}</span></Link>;
        })}
      </div>
      <h2 className="mb-3 mt-7 text-lg font-bold">共有基盤</h2>
      <Link href={KNOWLEDGE_NAV.href} className="block min-h-16 rounded-2xl border border-violet-500/25 bg-violet-500/[0.07] p-4"><strong>{KNOWLEDGE_NAV.icon} {KNOWLEDGE_NAV.label}</strong><span className="mt-1 block text-sm text-slate-400">{KNOWLEDGE_NAV.description}</span></Link>
    </main>
  );
}
