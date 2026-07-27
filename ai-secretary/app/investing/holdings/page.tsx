"use client";

import { InvestingShell } from "@/components/investing/Shell";
import { HoldingsTable } from "@/components/investing/HoldingsTable";
import { StatCard } from "@/components/investing/StatCard";
import { Skeleton } from "@/components/investing/ui";
import { usePortfolio } from "../usePortfolio";

export default function HoldingsPage() {
  const { data, loading } = usePortfolio();
  const summary = data?.summary;

  return (
    <InvestingShell title="保有株">
      <section className="mb-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
        {loading ? (
          [0, 1, 2].map((i) => <Skeleton key={i} className="h-[104px] rounded-2xl" />)
        ) : (
          <>
            <StatCard label="評価額合計" value={summary?.totalValueJpy ?? null} />
            <StatCard
              label="含み益合計"
              value={summary?.totalPnlJpy ?? null}
              deltaPct={summary?.totalPnlPct ?? null}
              emphasis
              delay={0.05}
            />
            <StatCard
              label="保有銘柄数"
              value={data ? data.positions.length : null}
              format="count"
              delay={0.1}
            />
          </>
        )}
      </section>

      {loading ? (
        <Skeleton className="h-[420px] rounded-2xl" />
      ) : (
        <HoldingsTable positions={data?.positions ?? []} title="保有一覧" />
      )}
    </InvestingShell>
  );
}
