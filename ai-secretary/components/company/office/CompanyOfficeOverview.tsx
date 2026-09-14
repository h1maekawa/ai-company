"use client";

import { Coffee } from "lucide-react";
import { Skeleton } from "@/components/ui/primitives";
import { DepartmentPanel } from "./DepartmentPanel";
import { TaskBoard } from "./TaskBoard";
import type { CompanyOfficeView } from "./useCompanyOffice";

function Stat({ label, value, alert, danger }: { label: string; value: string; alert?: boolean; danger?: boolean }) {
  const tone = danger
    ? "border-loss/40 bg-loss/10 text-loss"
    : alert
      ? "border-amber-400/40 bg-amber-400/10 text-amber-200"
      : "border-hairline bg-white/[0.03] text-slate-200";
  return (
    <div className={`flex items-baseline gap-1.5 rounded-lg border px-2.5 py-1.5 ${tone}`}>
      <dt className="text-[10px] uppercase tracking-wide opacity-70">{label}</dt>
      <dd className="text-xs font-semibold">{value}</dd>
    </div>
  );
}

/**
 * 会社の現在地。ホームと /company が同じものを見るための共有UI。
 *
 * ここは表示だけを持ち、データの組み立ては useCompanyOffice に置く。
 * 片方だけ直して画面ごとに見え方がずれるのを防ぐ（v2方針 §6）。
 */
export function CompanyOfficeOverview({
  view,
  title,
  subtitle,
  titleAs: Title = "h1",
}: {
  view?: CompanyOfficeView;
  title: string;
  subtitle: string;
  titleAs?: "h1" | "h2";
}) {
  if (!view) return <Skeleton className="h-96 rounded-2xl" />;

  return (
    <div className="space-y-4">
      <header className="rounded-2xl border border-hairline bg-ink-card px-5 py-4">
        <p className="text-xs font-medium uppercase tracking-[0.18em] text-brand">Simple Pixel Office</p>
        <div className="mt-1 flex flex-wrap items-end justify-between gap-3">
          <div>
            <Title className="text-xl font-semibold text-white">{title}</Title>
            <p className="mt-1 text-xs text-sub">{subtitle}</p>
          </div>
          <span className="inline-flex items-center gap-1.5 text-[11px] text-sub">
            <Coffee aria-hidden="true" className="h-3.5 w-3.5" /> Office online
          </span>
        </div>
        <dl className="mt-4 flex flex-wrap gap-2">
          <Stat label="稼働中" value={`${view.people.working} 人`} />
          <Stat label="待機" value={`${view.people.idle} 人`} />
          <Stat label="CEO確認" value={`${view.work.ceoReview} 件`} alert={view.work.ceoReview > 0} />
          <Stat label="問題" value={`${view.work.problem} 件`} danger={view.work.problem > 0} />
        </dl>
      </header>

      {/* 全体像が先。AI社員を横並びにしたので、事業ブロックは全幅で置く */}
      <DepartmentPanel departments={view.departments} />
      <TaskBoard tasks={view.tasks} />
    </div>
  );
}
