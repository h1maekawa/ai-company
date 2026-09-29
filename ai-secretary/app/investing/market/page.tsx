"use client";
import { useEffect, useState } from "react";
import type { IntelligenceToday } from "@/app/lib/investing/intelligence/types";
import { InvestingShell } from "@/components/investing/Shell";
import { Card, CardHeader, EmptyState, Skeleton } from "@/components/investing/ui";

export default function MarketPage() {
  const [today, setToday] = useState<IntelligenceToday | null | undefined>(undefined);
  useEffect(() => { fetch("/api/investing/intelligence/today").then((response) => response.json()).then((data) => setToday(data.today ?? null)).catch(() => setToday(null)); }, []);
  return <InvestingShell title="市場">{today === undefined ? <Skeleton className="h-72" /> : !today ? <Card><EmptyState title="市場データはまだありません" description="日次調査後にMarket / Sector / Themeを表示します。" /></Card> : <div className="grid gap-3 lg:grid-cols-3"><Card><CardHeader title="Market Regime" /><p className="text-2xl font-bold">{today.marketRegime}</p><p className="mt-2 text-xs text-sub">Evidence {today.marketEvidence.length}件</p></Card><Card><CardHeader title="Sector Strength" />{today.sectorStrength.length ? today.sectorStrength.map((item) => <p key={item.name} className="py-1 text-xs">{item.name}: {item.score ?? "未計測"}</p>) : <p className="text-xs text-sub">未計測</p>}</Card><Card><CardHeader title="Theme Strength" />{today.themeStrength.map((item) => <p key={item.name} className="py-1 text-xs">{item.name}: {item.score ?? "未計測"}</p>)}</Card></div>}</InvestingShell>;
}
