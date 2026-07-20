"use client";

import { useEffect, useState, useRef } from "react";
import Link from "next/link";
import PolicyEngineSection from "./PolicyEngineSection";

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

function decodeCsvBuffer(buffer: ArrayBuffer): string {
  // 楽天証券CSVはShift_JIS。UTF-8として厳密デコードに失敗したらShift_JISで読む
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(buffer);
  } catch {
    return new TextDecoder("shift_jis").decode(buffer);
  }
}

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
    <div className="flex-1 min-w-[140px]">
      <div className="flex justify-between text-xs text-slate-400 mb-1">
        <span>{label}</span>
        <span className="font-semibold text-slate-200">
          {pct}% <span className="text-slate-500">/ 目標{targetPct}%</span>
        </span>
      </div>
      <div className="relative w-full h-2.5 rounded-full bg-slate-800 overflow-hidden">
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

export default function FundPage() {
  const [data, setData] = useState<AllocationData | null>(null);
  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = async () => {
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
  };

  useEffect(() => {
    load();
  }, []);

  const handleFile = async (file: File) => {
    setImporting(true);
    setMessage(null);
    setError(null);
    try {
      const buffer = await file.arrayBuffer();
      const csvText = decodeCsvBuffer(buffer);
      const res = await fetch("/api/fund/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ csvText }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "取込に失敗しました");
      setMessage(`取込完了：${json.holdingsCount}件（${json.importedAt} JST）`);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "取込に失敗しました");
    } finally {
      setImporting(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const s = data?.summary ?? null;

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100 px-4 py-6 max-w-3xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold">投資部門</h1>
          <p className="text-xs text-slate-400 mt-1">
            楽天証券CSV取込・50:50配分・集中度
            {data?.importedAt && `｜最終取込 ${data.importedAt} JST`}
          </p>
        </div>
        <Link href="/report" className="text-xs text-blue-400 hover:underline">
          レポートへ
        </Link>
      </div>

      {/* CSV取込 */}
      <section className="mb-6 rounded-xl border border-slate-800 bg-slate-900/60 p-4">
        <h2 className="text-sm font-semibold mb-2">楽天証券 資産残高CSV取込</h2>
        <p className="text-xs text-slate-400 mb-3">
          口座管理 → 資産残高からダウンロードしたCSVを選択（Shift_JISのままで可）。
          取込結果は memory/personal/fund/holdings.md に保存されます。
        </p>
        <input
          ref={fileRef}
          type="file"
          accept=".csv,text/csv"
          disabled={importing}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) handleFile(f);
          }}
          className="text-xs text-slate-300 file:mr-3 file:rounded-lg file:border-0 file:bg-blue-600 file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-white hover:file:bg-blue-500"
        />
        {importing && <p className="text-xs text-blue-400 mt-2">取込中...</p>}
        {message && <p className="text-xs text-emerald-400 mt-2">{message}</p>}
        {error && <p className="text-xs text-rose-400 mt-2">{error}</p>}
      </section>

      {loading ? (
        <p className="text-sm text-slate-400">読み込み中...</p>
      ) : !data?.imported || !s ? (
        <p className="text-sm text-slate-400">
          まだCSVが取り込まれていません。上のフォームから取り込んでください。
        </p>
      ) : (
        <>
          {/* 投資可能額 */}
          <section className="mb-6 rounded-xl border border-slate-800 bg-slate-900/60 p-4">
            <h2 className="text-sm font-semibold mb-2">当月の投資可能額</h2>
            {data.capacity?.investable_amount != null ? (
              <p className="text-lg font-bold text-emerald-300">
                {jpy(data.capacity.investable_amount)}
                <span className="ml-2 text-xs font-normal text-slate-400">
                  {data.capacity.target_month}／
                  {data.capacity.source === "flow-plus" ? "Flow+自動取得" : "手動入力"}
                </span>
              </p>
            ) : (
              <p className="text-sm text-amber-300">
                未確定{" "}
                <span className="text-xs text-slate-400">
                  （Flow+連携前は memory/personal/fund/capacity.md に手動入力）
                </span>
              </p>
            )}
          </section>

          {/* 配分 */}
          <section className="mb-6 rounded-xl border border-slate-800 bg-slate-900/60 p-4">
            <h2 className="text-sm font-semibold mb-3">
              配分（保有商品合計 {jpy(s.totalMarketValueJpy)}）
            </h2>
            <div className="flex gap-4 flex-wrap mb-3">
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
            <p className="text-xs text-slate-300">
              {s.stockShortfallJpy >= 0 ? (
                <>
                  50:50到達に必要な個別株側の追加額:{" "}
                  <span className="font-semibold text-emerald-300">
                    {jpy(s.stockShortfallJpy)}
                  </span>
                </>
              ) : (
                <>
                  個別株側の超過額:{" "}
                  <span className="font-semibold text-amber-300">
                    {jpy(-s.stockShortfallJpy)}
                  </span>
                </>
              )}
              <span className="block text-slate-500 mt-1">
                一括購入はしない。投資可能額の範囲内で段階的に近づける。
              </span>
            </p>
          </section>

          {/* 集中度 */}
          <section className="mb-6 rounded-xl border border-slate-800 bg-slate-900/60 p-4">
            <h2 className="text-sm font-semibold mb-3">個別株の集中度</h2>
            <table className="w-full text-xs">
              <thead>
                <tr className="text-slate-400 border-b border-slate-800">
                  <th className="text-left py-1.5">銘柄</th>
                  <th className="text-right py-1.5">評価額</th>
                  <th className="text-right py-1.5">総資産比</th>
                  <th className="text-right py-1.5">個別株内</th>
                </tr>
              </thead>
              <tbody>
                {s.concentrations.map((c) => (
                  <tr key={c.name} className="border-b border-slate-800/60">
                    <td className="py-1.5">
                      {c.name}
                      {c.code && <span className="text-slate-500">（{c.code}）</span>}
                    </td>
                    <td className="text-right py-1.5">{jpy(c.marketValueJpy)}</td>
                    <td className="text-right py-1.5">{c.pctOfTotal}%</td>
                    <td
                      className={`text-right py-1.5 font-semibold ${
                        c.pctOfStocks >= 50 ? "text-amber-300" : "text-slate-200"
                      }`}
                    >
                      {c.pctOfStocks}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="text-xs text-slate-400 mt-2">
              上位2銘柄合計：総資産比 {s.top2StocksPctOfTotal}%／個別株内{" "}
              <span
                className={
                  s.top2StocksPctOfStocks >= 80 ? "text-amber-300 font-semibold" : ""
                }
              >
                {s.top2StocksPctOfStocks}%
              </span>
            </p>
          </section>

          {/* 保有一覧 */}
          <section className="mb-6 rounded-xl border border-slate-800 bg-slate-900/60 p-4">
            <h2 className="text-sm font-semibold mb-3">保有商品一覧</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-xs whitespace-nowrap">
                <thead>
                  <tr className="text-slate-400 border-b border-slate-800">
                    <th className="text-left py-1.5">種別</th>
                    <th className="text-left py-1.5">銘柄</th>
                    <th className="text-right py-1.5">評価額</th>
                    <th className="text-right py-1.5">評価損益</th>
                    <th className="text-right py-1.5">損益率</th>
                  </tr>
                </thead>
                <tbody>
                  {data.holdings.map((h, i) => (
                    <tr key={`${h.name}-${i}`} className="border-b border-slate-800/60">
                      <td className="py-1.5 text-slate-400">{h.category}</td>
                      <td className="py-1.5">{h.name}</td>
                      <td className="text-right py-1.5">{jpy(h.marketValueJpy)}</td>
                      <td
                        className={`text-right py-1.5 ${
                          (h.pnlJpy ?? 0) >= 0 ? "text-emerald-300" : "text-rose-300"
                        }`}
                      >
                        {jpy(h.pnlJpy)}
                      </td>
                      <td className="text-right py-1.5">
                        {h.pnlPct == null ? "-" : `${h.pnlPct}%`}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <p className="text-[11px] text-slate-500 mb-6">
            本画面は分析・候補提示のみを行う。証券注文の自動実行は行わない。最終判断は本人が行う。
          </p>
        </>
      )}

      {/* 投資判断エンジン（docs/12_FUND_POLICY_ENGINE.md Phase 1.3） */}
      <PolicyEngineSection />
    </main>
  );
}
