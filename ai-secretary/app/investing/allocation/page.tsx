"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { InvestingShell } from "@/components/investing/Shell";

/**
 * /investing/allocation — 投資可能額・投信50:個別株50差分・個別株集中度・保有一覧。
 * （旧 /fund の配分/集中度セクションを Canonical Route /investing 配下へ移設）
 * API（GET /api/fund/allocation）・保存パスは不変。
 */
type Holding = {
  category: string;
  name: string;
  code: string;
  quantity: number | null;
  avgCost: number | null;
  marketValueJpy: number | null;
  pnlJpy: number | null;
  pnlPct: number | null;
};

type ConcentrationEntry = {
  name: string;
  code: string;
  marketValueJpy: number;
  pctOfTotal: number;
  pctOfStocks: number;
};

type AllocationSummary = {
  totalMarketValueJpy: number;
  fundValueJpy: number;
  stockValueJpy: number;
  fundPct: number;
  stockPct: number;
  targetFundPct: number;
  targetStockPct: number;
  stockShortfallJpy: number;
  concentrations: ConcentrationEntry[];
  top2StocksPctOfStocks: number;
  top2StocksPctOfTotal: number;
};

type CapacityData = {
  target_month: string | null;
  investable_amount: number | null;
  source: string;
  calculated_at: string | null;
};

type AllocationData = {
  imported: boolean;
  importedAt: string | null;
  summary: AllocationSummary | null;
  holdings: Holding[];
  capacity: CapacityData | null;
  capacityStatus: string;
};

const jpy = (n: number | null | undefined) =>
  n == null ? "-" : `${n.toLocaleString("ja-JP")}円`;

function AllocationBar({
  label,
  pct,
  targetPct,
  color,
}: {
  label: string;
  pct: number;
  targetPct: number;
  color: string;
}) {
  return (
    <div className="min-w-[140px] flex-1">
      <div className="mb-1 flex justify-between text-xs text-sub">
        <span>{label}</span>
        <span className="font-semibold text-white">
          {pct}% <span className="text-sub">/ 目標{targetPct}%</span>
        </span>
      </div>
      <div className="relative h-2.5 w-full overflow-hidden rounded-full bg-white/[0.06]">
        <div className={`h-full ${color}`} style={{ width: `${Math.min(pct, 100)}%` }} />
        <div
          className="absolute top-0 h-full w-0.5 bg-white/70"
          style={{ left: `${targetPct}%` }}
          title={`目標 ${targetPct}%`}
        />
      </div>
    </div>
  );
}

export default function InvestingAllocationPage() {
  const [data, setData] = useState<AllocationData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/fund/allocation");
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || "取得に失敗しました");
        setData(json);
      } catch (e) {
        setError(e instanceof Error ? e.message : "取得に失敗しました");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const s = data?.summary ?? null;

  return (
    <InvestingShell title="配分・集中度">
      {error && (
        <p className="mb-4 rounded-xl border border-loss/25 bg-loss/10 px-4 py-3 text-sm text-loss">
          {error}
        </p>
      )}

      {loading ? (
        <p className="text-sm text-sub">読み込み中...</p>
      ) : !data?.imported || !s ? (
        <div className="rounded-2xl border border-hairline bg-ink-card p-5">
          <p className="text-sm font-semibold text-white">まだCSVが取り込まれていません</p>
          <p className="mt-1 text-xs text-sub">楽天証券の資産残高CSVを取り込むと、ここに配分と集中度が表示されます。</p>
          <Link
            href="/investing/import"
            className="mt-3 inline-block rounded-xl bg-brand px-4 py-2 text-xs font-semibold text-white hover:bg-brand/85"
          >
            CSVを取り込む
          </Link>
        </div>
      ) : (
        <>
          {/* 投資可能額 */}
          <section className="mb-5 rounded-2xl border border-hairline bg-ink-card p-5">
            <h2 className="mb-2 text-sm font-semibold text-white">当月の投資可能額</h2>
            {data.capacity?.investable_amount != null ? (
              <p className="text-lg font-bold text-emerald-300">
                {jpy(data.capacity.investable_amount)}
                <span className="ml-2 text-xs font-normal text-sub">
                  {data.capacity.target_month}／
                  {data.capacity.source === "flow-plus" || data.capacity.source === "flow_plus"
                    ? "Flow+自動取得"
                    : "手動入力"}
                </span>
              </p>
            ) : (
              <p className="text-sm text-amber-300">
                未確定{" "}
                <span className="text-xs text-sub">
                  （Flow+連携前は memory/personal/fund/capacity.md に手動入力）
                </span>
              </p>
            )}
          </section>

          {/* 配分 */}
          <section className="mb-5 rounded-2xl border border-hairline bg-ink-card p-5">
            <h2 className="mb-3 text-sm font-semibold text-white">
              配分（保有商品合計 {jpy(s.totalMarketValueJpy)}）
            </h2>
            <div className="mb-3 flex flex-wrap gap-4">
              <AllocationBar
                label={`投資信託 ${jpy(s.fundValueJpy)}`}
                pct={s.fundPct}
                targetPct={s.targetFundPct}
                color="bg-blue-500"
              />
              <AllocationBar
                label={`個別株 ${jpy(s.stockValueJpy)}`}
                pct={s.stockPct}
                targetPct={s.targetStockPct}
                color="bg-emerald-500"
              />
            </div>
            <p className="text-xs text-sub">
              {s.stockShortfallJpy >= 0 ? (
                <>
                  50:50到達に必要な個別株側の追加額:{" "}
                  <span className="font-semibold text-emerald-300">{jpy(s.stockShortfallJpy)}</span>
                </>
              ) : (
                <>
                  個別株側の超過額:{" "}
                  <span className="font-semibold text-amber-300">{jpy(-s.stockShortfallJpy)}</span>
                </>
              )}
              <span className="mt-1 block text-sub">
                一括購入はしない。投資可能額の範囲内で段階的に近づける。
              </span>
            </p>
          </section>

          {/* 集中度 */}
          <section className="mb-5 rounded-2xl border border-hairline bg-ink-card p-5">
            <h2 className="mb-3 text-sm font-semibold text-white">個別株の集中度</h2>
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-hairline text-sub">
                  <th className="py-1.5 text-left">銘柄</th>
                  <th className="py-1.5 text-right">評価額</th>
                  <th className="py-1.5 text-right">総資産比</th>
                  <th className="py-1.5 text-right">個別株内</th>
                </tr>
              </thead>
              <tbody>
                {s.concentrations.map((c) => (
                  <tr key={c.name} className="border-b border-hairline/60">
                    <td className="py-1.5 text-white">
                      {c.name}
                      {c.code && <span className="text-sub">（{c.code}）</span>}
                    </td>
                    <td className="py-1.5 text-right text-white">{jpy(c.marketValueJpy)}</td>
                    <td className="py-1.5 text-right text-white">{c.pctOfTotal}%</td>
                    <td
                      className={`py-1.5 text-right font-semibold ${
                        c.pctOfStocks >= 50 ? "text-amber-300" : "text-white"
                      }`}
                    >
                      {c.pctOfStocks}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mt-2 text-xs text-sub">
              上位2銘柄合計：総資産比 {s.top2StocksPctOfTotal}%／個別株内{" "}
              <span className={s.top2StocksPctOfStocks >= 80 ? "font-semibold text-amber-300" : ""}>
                {s.top2StocksPctOfStocks}%
              </span>
            </p>
          </section>

          {/* 保有一覧 */}
          <section className="mb-5 rounded-2xl border border-hairline bg-ink-card p-5">
            <h2 className="mb-3 text-sm font-semibold text-white">保有商品一覧</h2>
            <div className="overflow-x-auto">
              <table className="w-full whitespace-nowrap text-xs">
                <thead>
                  <tr className="border-b border-hairline text-sub">
                    <th className="py-1.5 text-left">種別</th>
                    <th className="py-1.5 text-left">銘柄</th>
                    <th className="py-1.5 text-right">評価額</th>
                    <th className="py-1.5 text-right">評価損益</th>
                    <th className="py-1.5 text-right">損益率</th>
                  </tr>
                </thead>
                <tbody>
                  {data.holdings.map((h, i) => (
                    <tr key={`${h.name}-${i}`} className="border-b border-hairline/60">
                      <td className="py-1.5 text-sub">{h.category}</td>
                      <td className="py-1.5 text-white">{h.name}</td>
                      <td className="py-1.5 text-right text-white">{jpy(h.marketValueJpy)}</td>
                      <td
                        className={`py-1.5 text-right ${
                          (h.pnlJpy ?? 0) >= 0 ? "text-emerald-300" : "text-loss"
                        }`}
                      >
                        {jpy(h.pnlJpy)}
                      </td>
                      <td className="py-1.5 text-right text-white">
                        {h.pnlPct == null ? "-" : `${h.pnlPct}%`}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <p className="mb-6 text-[11px] text-sub">
            本画面は分析・候補提示のみを行う。証券注文の自動実行は行わない。最終判断は本人が行う。
          </p>
        </>
      )}
    </InvestingShell>
  );
}
