"use client";

import Link from "next/link";
import { AlertCircle } from "lucide-react";
import { InvestingShell } from "@/components/investing/Shell";
import { StatCard } from "@/components/investing/StatCard";
import { AssetChart } from "@/components/investing/AssetChart";
import { PortfolioDonut } from "@/components/investing/PortfolioDonut";
import { HoldingsTable } from "@/components/investing/HoldingsTable";
import { NewsPanel } from "@/components/investing/NewsPanel";
import { AiSuggestCard } from "@/components/investing/AiSuggestCard";
import { Skeleton } from "@/components/investing/ui";
import { useAnalysis, useNews, usePortfolio } from "./usePortfolio";

const SOURCE_LABEL: Record<string, string> = {
  holdings_csv: "楽天証券CSV",
  positions_md: "positions.md（手動更新）",
  none: "未取込",
};

export default function InvestingDashboard() {
  const { data, loading, error } = usePortfolio();
  const analysis = useAnalysis();
  const news = useNews();

  const summary = data?.summary;
  const history = data?.history ?? [];

  return (
    <InvestingShell title="ダッシュボード">
      {error && (
        <div className="mb-5 flex items-start gap-2 rounded-xl border border-loss/25 bg-loss/10 px-4 py-3 text-sm text-loss">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* データ未取込の案内 */}
      {!loading && data?.source === "none" && (
        <div className="mb-5 rounded-2xl border border-hairline bg-ink-card p-5">
          <p className="text-sm font-semibold text-white">保有データがまだありません</p>
          <p className="mt-1 text-xs leading-relaxed text-sub">
            楽天証券のCSVを取り込むか、Vaultの
            <code className="mx-1 rounded bg-white/[0.06] px-1 py-0.5 text-[11px]">
              memory/personal/fund/positions.md
            </code>
            に保有を記録すると、この画面に実データが表示されます。
          </p>
          <Link
            href="/fund"
            className="mt-3 inline-block rounded-xl bg-brand px-4 py-2 text-xs font-semibold text-white hover:bg-brand/85"
          >
            投資部門でCSVを取り込む
          </Link>
        </div>
      )}

      {/* ─── 上部KPI 4枚 ───────────────────────────── */}
      <section className="mb-5 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {loading ? (
          [0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-[104px] rounded-2xl" />)
        ) : (
          <>
            <StatCard
              label="資産総額"
              value={summary?.totalValueJpy ?? null}
              delta={summary?.todayPnlJpy ?? null}
              deltaPct={summary?.todayPnlPct ?? null}
              spark={history}
              delay={0}
            />
            <StatCard
              label="含み益"
              value={summary?.totalPnlJpy ?? null}
              deltaPct={summary?.totalPnlPct ?? null}
              emphasis
              delay={0.05}
            />
            <StatCard
              label="現金残高"
              value={summary?.cashJpy ?? null}
              delay={0.1}
            />
            <StatCard
              label="評価損益率"
              value={summary?.totalPnlPct ?? null}
              format="pct"
              spark={history}
              delay={0.15}
            />
          </>
        )}
      </section>

      {/* ─── 中央: 資産推移 / 円グラフ / AI提案 ─────── */}
      <section className="mb-5 grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)_minmax(0,1fr)]">
        <div className="min-w-0">
          {loading ? <Skeleton className="h-[340px] rounded-2xl" /> : <AssetChart points={history} />}
        </div>
        <div className="min-w-0">
          {loading || !summary ? (
            <Skeleton className="h-[340px] rounded-2xl" />
          ) : (
            <PortfolioDonut summary={summary} />
          )}
        </div>
        <div className="min-w-0">
          <AiSuggestCard
            comment={analysis.comment}
            health={analysis.health}
            loading={analysis.loading}
          />
        </div>
      </section>

      {/* ─── 下部: 保有株 / ニュース ────────────────── */}
      <section className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <div className="min-w-0">
          {loading ? (
            <Skeleton className="h-[320px] rounded-2xl" />
          ) : (
            <HoldingsTable positions={data?.positions ?? []} limit={5} />
          )}
        </div>
        <div className="min-w-0">
          <NewsPanel
            items={news.items}
            available={news.available}
            loading={news.loading}
            limit={4}
          />
        </div>
      </section>

      {/* データ出所を明示する（数字の信頼性のため） */}
      {!loading && data && data.source !== "none" && (
        <p className="mt-5 text-center text-[11px] text-sub">
          データ出所: {SOURCE_LABEL[data.source]}
          {data.updatedAt ? ` ・ 最終更新 ${data.updatedAt}` : ""}
        </p>
      )}
    </InvestingShell>
  );
}
