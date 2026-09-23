"use client";

import Link from "next/link";
import { InvestingShell } from "@/components/investing/Shell";
import { Badge, Card, CardHeader, Skeleton } from "@/components/investing/ui";
import type { WatchTheme } from "@/app/lib/investing/watchlist";
import { latestRecommendations, useJson, usePortfolio, type FundRecommendationView } from "../usePortfolio";

type CompanyRow = { ticker: string; name: string; detail: string };

function CompanyList({ title, hint, rows, loading, empty }: { title: string; hint: string; rows: CompanyRow[]; loading: boolean; empty: string }) {
  return (
    <Card padded={false}>
      <div className="px-5 pt-5"><CardHeader title={title} hint={hint} /></div>
      {loading ? <div className="px-5 pb-5"><Skeleton className="h-20" /></div> : rows.length === 0 ? <p className="px-5 pb-5 text-sm text-sub">{empty}</p> : (
        <ul className="divide-y divide-hairline/60">
          {rows.map((row) => (
            <li key={`${title}-${row.ticker}`}>
              <Link href={`/investing/companies/${encodeURIComponent(row.ticker)}`} className="flex min-h-11 items-center gap-3 px-5 py-3 hover:bg-white/[0.03]">
                <Badge>{row.ticker}</Badge>
                <span className="min-w-0 flex-1 truncate text-sm text-white">{row.name}</span>
                <span className="shrink-0 text-[11px] text-sub">{row.detail}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

/** 会社分析の入口。Holdings / Watchlist / Research Candidates から企業へ移動する。 */
export default function CompaniesPage() {
  const portfolio = usePortfolio();
  const watchlist = useJson<{ themes: WatchTheme[] }>("/api/investing/watchlist");
  const recommendations = useJson<{ recommendations: FundRecommendationView[] }>("/api/fund/recommendations");

  const holdings = (portfolio.data?.positions ?? [])
    .filter((position) => position.assetClass === "us_stock" || position.assetClass === "jp_stock")
    .map((position) => ({ ticker: position.code, name: position.name, detail: "保有" }));
  const watched = (watchlist.data?.themes ?? []).flatMap((theme) => theme.items.map((item) => ({ ticker: item.ticker, name: item.name, detail: theme.theme })));
  const seen = new Set<string>();
  const candidates = latestRecommendations(recommendations.data?.recommendations)
    .filter((item) => !seen.has(item.ticker) && seen.add(item.ticker))
    .map((item) => ({ ticker: item.ticker, name: item.ticker, detail: `${item.decision} · ${item.horizon}` }));

  return (
    <InvestingShell title="Companies">
      <div className="grid gap-4 lg:grid-cols-3">
        <CompanyList title="Holdings" hint="保有中の個別株" rows={holdings} loading={portfolio.loading} empty={portfolio.error ? "未取得（保有データを取得できませんでした）" : "保有中の個別株はありません"} />
        <CompanyList title="Watchlist" hint="watchlist.md" rows={watched} loading={watchlist.loading} empty={watchlist.data === null ? "未取得" : "監視銘柄はありません"} />
        <CompanyList title="Research Candidates" hint="Policy Engineの評価記録" rows={candidates} loading={recommendations.loading} empty={recommendations.data === null ? "未取得" : "評価記録はありません"} />
      </div>
    </InvestingShell>
  );
}
