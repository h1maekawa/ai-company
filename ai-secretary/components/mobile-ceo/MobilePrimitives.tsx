import Link from "next/link";
import type { ReactNode } from "react";

export const panelClass = "rounded-2xl border border-slate-800 bg-slate-900/70 p-4 shadow-sm";

export function UnknownValue({ value, unit = "" }: { value: number | null; unit?: string }) {
  return <span>{value === null ? "UNKNOWN" : `${value.toLocaleString("ja-JP")}${unit}`}</span>;
}

export function Section({ title, href, children }: { title: string; href?: string; children: ReactNode }) {
  return <section className={panelClass}>
    <div className="mb-3 flex items-center justify-between gap-3">
      <h2 className="text-base font-bold text-white">{title}</h2>
      {href && <Link className="min-h-11 rounded-lg px-3 py-2 text-sm text-violet-300" href={href}>詳細</Link>}
    </div>
    {children}
  </section>;
}

export function PageState({ children, retry }: { children: ReactNode; retry?: () => void }) {
  return <div className={`${panelClass} text-sm text-slate-300`}>
    {children}
    {retry && <button type="button" onClick={retry} className="mt-3 min-h-11 rounded-xl bg-violet-600 px-4 font-semibold text-white">再試行</button>}
  </div>;
}
