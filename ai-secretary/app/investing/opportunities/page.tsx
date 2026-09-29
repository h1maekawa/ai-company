"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import type { InvestmentOpportunity } from "@/app/lib/investing/intelligence/types";
import { InvestingShell } from "@/components/investing/Shell";
import { Card, EmptyState, Skeleton } from "@/components/investing/ui";

export default function OpportunitiesPage() {
  const [items, setItems] = useState<InvestmentOpportunity[] | null>(null);
  useEffect(() => { fetch("/api/investing/opportunities").then((response) => response.json()).then((data) => setItems(data.opportunities ?? [])).catch(() => setItems([])); }, []);
  return <InvestingShell title="機会">{items === null ? <Skeleton className="h-72" /> : items.length === 0 ? <Card><EmptyState title="Opportunityはまだありません" description="日次調査後にEvidence付き候補を表示します。" /></Card> : <div className="overflow-x-auto rounded-2xl border border-hairline bg-ink-card"><table className="w-full min-w-[720px] text-left text-xs"><thead className="border-b border-hairline text-sub"><tr>{["Status", "Ticker", "Theme", "Score", "Coverage", "Relative Volume", "Catalyst"].map((label) => <th key={label} className="px-4 py-3 font-medium">{label}</th>)}</tr></thead><tbody className="divide-y divide-hairline">{items.map((item) => <tr key={item.id} className="hover:bg-white/[0.02]"><td className="px-4 py-3">{item.gate}</td><td className="px-4 py-3"><Link className="font-semibold text-brand" href={`/investing/opportunities/${encodeURIComponent(item.id)}`}>{item.ticker}</Link></td><td className="px-4 py-3">{item.theme}</td><td className="px-4 py-3 tabular-nums">{item.score ?? "—"}</td><td className="px-4 py-3 tabular-nums">{item.scoreCoverage}%</td><td className="px-4 py-3 tabular-nums">{item.relativeVolume?.toFixed(2) ?? "—"}x</td><td className="px-4 py-3 text-sub">{item.catalyst ?? "未取得"}</td></tr>)}</tbody></table></div>}</InvestingShell>;
}
