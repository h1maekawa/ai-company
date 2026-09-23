import Link from "next/link";
import { displayStatus, formatRelativeTime } from "@/app/lib/mobile-ceo/controlCenter";
import { Section } from "./MobilePrimitives";

export type DepartmentResearchPayload = {
  items: Array<{ id: string; topic: string; title: string; freshnessStatus: string; fetchedAt: string }> | null;
  artifacts?: Array<{ id: string }> | null;
  health: Array<{ status: string; lastSuccessfulRun: string | null; freshItemCount: number; staleItemCount: number }> | null;
};

/** Departmentトップ用のResearch要約。本文は載せず、詳細はResearch画面へ送る。 */
export function DepartmentResearchSummary({ research, href }: { research: DepartmentResearchPayload | null; href: string }) {
  const items = research?.items ?? null;
  const health = research?.health?.[0];
  const latestFetched = items?.map((item) => item.fetchedAt).sort().at(-1) ?? health?.lastSuccessfulRun ?? null;
  const latest = (items ?? []).filter((item) => item.freshnessStatus === "FRESH").slice(-3).reverse();
  const stats: Array<[string, string]> = [
    ["最新取得", formatRelativeTime(latestFetched)],
    ["Fresh", items ? `${items.filter((item) => item.freshnessStatus === "FRESH").length}件` : "未取得"],
    ["Stale", items ? `${items.filter((item) => item.freshnessStatus === "STALE").length}件` : "未取得"],
    ["候補", research?.artifacts ? `${research.artifacts.length}件` : "未取得"],
  ];
  return (
    <Section title="Research">
      <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {stats.map(([label, value]) => <div key={label} className="rounded-xl border border-slate-800 bg-slate-950/60 p-2"><dt className="text-[11px] text-slate-400">{label}</dt><dd className="mt-1 font-bold">{value}</dd></div>)}
      </dl>
      <p className="mt-2 text-[10px] text-slate-500">Health: {displayStatus(health?.status)}</p>
      {latest.length ? <ul className="mt-3 space-y-1 text-sm">{latest.map((item) => <li key={item.id} className="truncate text-slate-300">・{item.topic}：{item.title}</li>)}</ul> : null}
      <Link href={href} className="mt-3 flex min-h-11 items-center justify-center rounded-xl border border-slate-700 text-sm text-violet-300">Researchを見る</Link>
    </Section>
  );
}
