"use client";

import { useState, type FormEvent } from "react";
import type { DepartmentId, DepartmentMetric } from "@/app/lib/mobile-ceo/departments";
import { formatMetricValue, KPI_GOAL_PERIODS, type DepartmentKpiGoal } from "@/app/lib/mobile-ceo/controlCenter";
import { postHumanDecision } from "./HumanDecision";
import { Section } from "./MobilePrimitives";

export type KpiRow = { metric: string; label: string; actual: DepartmentMetric | null };
const PERIOD_LABEL: Record<DepartmentKpiGoal["period"], string> = { daily: "日", weekly: "週", monthly: "月" };

/**
 * KPIの「実績」と「目標」を分けて表示する。
 * 実績が無いものは 0 ではなく「未取得」。目標はCEOの入力でのみ保存し、AIは確定しない。
 */
export function DepartmentKpiPanel({ id, rows, goals, onChanged }: { id: DepartmentId; rows: KpiRow[]; goals: DepartmentKpiGoal[] | null; onChanged: () => void }) {
  const [editing, setEditing] = useState(false);
  const [message, setMessage] = useState("");

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const error = await postHumanDecision(`/api/company/departments/${id}/control`, { action: "set-kpi-goal", confirmedByHuman: true, metric: form.get("metric"), target: Number(form.get("target")), period: form.get("period"), note: form.get("note") });
    setMessage(error ?? "目標を保存しました。");
    if (!error) { setEditing(false); onChanged(); }
  }

  return (
    <Section title="KPI">
      <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {rows.map((row) => {
          const goal = goals?.find((item) => item.metric === row.metric);
          return (
            <li key={row.metric} className="min-w-0 rounded-xl border border-slate-800 bg-slate-950/60 p-3">
              <div className="text-xs text-slate-400">{row.label}</div>
              <dl className="mt-1 grid grid-cols-[3rem_1fr] gap-y-1 text-sm">
                <dt className="text-slate-500">実績</dt><dd className="break-words font-bold">{formatMetricValue(row.actual)}</dd>
                <dt className="text-slate-500">目標</dt><dd className="break-words">{goal ? `${goal.target.toLocaleString("ja-JP")} / ${PERIOD_LABEL[goal.period]}` : goals === null ? "未取得" : "未設定"}</dd>
              </dl>
              {row.actual ? <p className="mt-1 text-[10px] text-slate-600">{row.actual.source}{row.actual.asOf ? ` · as of ${row.actual.asOf.slice(0, 16).replace("T", " ")}` : ""}</p> : <p className="mt-1 text-[10px] text-slate-600">データ接続なし</p>}
              {goal?.note ? <p className="mt-1 text-[10px] text-amber-200/80">CEO補足: {goal.note}</p> : null}
            </li>
          );
        })}
      </ul>
      {editing ? (
        <form onSubmit={save} className="mt-3 space-y-2 rounded-xl border border-slate-700 p-3">
          <p className="text-xs text-slate-400">CEOが設定した値だけを目標として保存します。</p>
          <select name="metric" required className="min-h-11 w-full rounded-xl border border-slate-700 bg-slate-950 px-3">{rows.map((row) => <option key={row.metric} value={row.metric}>{row.label}</option>)}</select>
          <div className="grid grid-cols-2 gap-2">
            <input name="target" type="number" min="0" step="any" required placeholder="Target" className="min-h-11 min-w-0 rounded-xl border border-slate-700 bg-slate-950 px-3"/>
            <select name="period" defaultValue="weekly" className="min-h-11 rounded-xl border border-slate-700 bg-slate-950 px-3">{KPI_GOAL_PERIODS.map((period) => <option key={period} value={period}>{period}</option>)}</select>
          </div>
          <input name="note" maxLength={300} placeholder="補足（任意）" className="min-h-11 w-full rounded-xl border border-slate-700 bg-slate-950 px-3"/>
          <div className="grid grid-cols-2 gap-2"><button type="button" onClick={() => setEditing(false)} className="min-h-11 rounded-xl border border-slate-700 text-sm">キャンセル</button><button className="min-h-11 rounded-xl bg-violet-600 text-sm font-semibold">目標を保存</button></div>
        </form>
      ) : <button type="button" onClick={() => setEditing(true)} className="mt-3 min-h-11 w-full rounded-xl border border-slate-700 text-sm text-violet-300">目標を設定する</button>}
      {message ? <p role="status" className="mt-2 text-xs text-amber-200">{message}</p> : null}
    </Section>
  );
}
