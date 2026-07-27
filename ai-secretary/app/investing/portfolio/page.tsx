"use client";

import { InvestingShell } from "@/components/investing/Shell";
import { PortfolioDonut } from "@/components/investing/PortfolioDonut";
import { HoldingsTable } from "@/components/investing/HoldingsTable";
import { AssetChart } from "@/components/investing/AssetChart";
import { Skeleton } from "@/components/investing/ui";
import { usePortfolio } from "../usePortfolio";

export default function PortfolioPage() {
  const { data, loading } = usePortfolio();

  return (
    <InvestingShell title="ポートフォリオ">
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <div className="min-w-0 space-y-4">
          {loading ? (
            <Skeleton className="h-[340px] rounded-2xl" />
          ) : (
            <AssetChart points={data?.history ?? []} />
          )}
          {loading ? (
            <Skeleton className="h-[320px] rounded-2xl" />
          ) : (
            <HoldingsTable positions={data?.positions ?? []} title="構成銘柄" />
          )}
        </div>
        <div className="min-w-0">
          {loading || !data ? (
            <Skeleton className="h-[340px] rounded-2xl" />
          ) : (
            <PortfolioDonut summary={data.summary} />
          )}
        </div>
      </div>
    </InvestingShell>
  );
}
