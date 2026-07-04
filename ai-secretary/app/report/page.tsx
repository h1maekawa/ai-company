"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type TableRow = Record<string, string>;

type ReportData = {
  updatedAt: string | null;
  satellitePositions: TableRow[];
  corePositions: TableRow[];
  summaryBullets: string[];
  targetAllocation: { core: string; satellite: string; cash: string } | null;
  currentAllocation: { core: string; satellite: string; cash: string } | null;
  reviewChecklist: string[];
  logEntries: { fileName: string; title: string; date: string; ticker: string }[];
};

function parsePnl(value: string | undefined): number {
  if (!value) return 0;
  const cleaned = value.replace(/[+%]/g, "");
  const n = parseFloat(cleaned);
  return Number.isNaN(n) ? 0 : n;
}

function PnlBadge({ value }: { value: string | undefined }) {
  const n = parsePnl(value);
  const positive = n >= 0;
  return (
    <span
      className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
        positive ? "bg-emerald-900/60 text-emerald-300" : "bg-rose-900/60 text-rose-300"
      }`}
    >
      {value || "-"}
    </span>
  );
}

function ConvictionBadge({ rank }: { rank: string | undefined }) {
  const colors: Record<string, string> = {
    S: "bg-purple-900/60 text-purple-300",
    A: "bg-blue-900/60 text-blue-300",
    B: "bg-slate-700 text-slate-300",
    C: "bg-amber-900/60 text-amber-300",
  };
  if (!rank) return null;
  return (
    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${colors[rank] ?? "bg-slate-700 text-slate-300"}`}>
      {rank}
    </span>
  );
}

function AllocationBar({
  label,
  value,
  color,
}: {
  label: string;
  value: number;
  color: string;
}) {
  return (
    <div className="flex-1 min-w-[90px]">
      <div className="flex justify-between text-xs text-slate-400 mb-1">
        <span>{label}</span>
        <span className="font-semibold text-slate-200">{value}%</span>
      </div>
      <div className="w-full h-2 rounded-full bg-slate-800 overflow-hidden">
        <div className={`h-full ${color}`} style={{ width: `${Math.min(value, 100)}%` }} />
      </div>
    </div>
  );
}

export default function ReportPage() {
  const [data, setData] = useState<ReportData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch("/api/fund/report", {
          headers: { "x-api-secret": process.env.NEXT_PUBLIC_API_SECRET ?? "" },
        });
        const json = await res.json();
        if (!res.ok) {
          setError(json.error ?? "読み込みに失敗しました");
        } else {
          setData(json);
        }
      } catch (e) {
        setError("接続エラーが発生しました");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  return (
    <div className="min-h-screen bg-[#0f1117] px-3 py-4 sm:px-6 sm:py-6">
      <div className="max-w-3xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-4 sm:mb-6">
          <div>
            <h1 className="text-white font-bold text-lg sm:text-xl flex items-center gap-2">
              📊 投資レポート
            </h1>
            {data?.updatedAt && (
              <p className="text-slate-500 text-xs mt-0.5">最終更新：{data.updatedAt}</p>
            )}
          </div>
          <Link
            href="/"
            className="text-xs sm:text-sm text-slate-400 hover:text-slate-200 border border-slate-700 rounded-lg px-3 py-1.5 hover:border-slate-500 transition-colors"
          >
            ← 秘書に戻る
          </Link>
        </div>

        {loading && (
          <div className="text-center py-16 text-slate-500 text-sm animate-pulse">読み込み中...</div>
        )}

        {error && (
          <div className="bg-rose-950/40 border border-rose-800/60 text-rose-300 text-sm rounded-xl p-4 mb-4">
            ⚠️ {error}
          </div>
        )}

        {data && (
          <div className="space-y-4 sm:space-y-6">
            {/* Allocation */}
            {(data.targetAllocation || data.currentAllocation) && (
              <section className="bg-slate-900/50 border border-slate-800 rounded-xl p-4">
                <h2 className="text-slate-200 font-semibold text-sm mb-3">💰 資産配分</h2>
                <div className="space-y-3">
                  {data.targetAllocation && (
                    <div>
                      <p className="text-[11px] text-slate-500 mb-1.5">目標</p>
                      <div className="flex flex-wrap gap-3">
                        <AllocationBar label="コア" value={Number(data.targetAllocation.core)} color="bg-blue-500" />
                        <AllocationBar label="サテライト" value={Number(data.targetAllocation.satellite)} color="bg-violet-500" />
                        <AllocationBar label="キャッシュ" value={Number(data.targetAllocation.cash)} color="bg-slate-400" />
                      </div>
                    </div>
                  )}
                  {data.currentAllocation && (
                    <div>
                      <p className="text-[11px] text-slate-500 mb-1.5">現在</p>
                      <div className="flex flex-wrap gap-3">
                        <AllocationBar label="コア" value={Number(data.currentAllocation.core)} color="bg-blue-500" />
                        <AllocationBar label="サテライト" value={Number(data.currentAllocation.satellite)} color="bg-violet-500" />
                        <AllocationBar label="キャッシュ" value={Number(data.currentAllocation.cash)} color="bg-slate-400" />
                      </div>
                      {Number(data.currentAllocation.cash) < 5 && (
                        <p className="text-amber-400 text-xs mt-2">⚠️ キャッシュ比率が目標(5%)を下回っています</p>
                      )}
                    </div>
                  )}
                </div>
              </section>
            )}

            {/* Satellite positions */}
            {data.satellitePositions.length > 0 && (
              <section className="bg-slate-900/50 border border-slate-800 rounded-xl p-4">
                <h2 className="text-slate-200 font-semibold text-sm mb-3">📈 サテライト資産（個別株）</h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {data.satellitePositions.map((row, i) => (
                    <div key={i} className="bg-slate-800/60 border border-slate-700/60 rounded-lg p-3">
                      <div className="flex items-center justify-between mb-2">
                        <span className="font-bold text-white text-sm">{row["Ticker"]}</span>
                        <div className="flex items-center gap-1.5">
                          <ConvictionBadge rank={row["Conviction Rank"]} />
                          <PnlBadge value={row["PnL (%)"]} />
                        </div>
                      </div>
                      <div className="text-xs text-slate-400 space-y-0.5">
                        <p>
                          {row["Entry Price"]} → <span className="text-slate-200">{row["Current Price"]}</span>
                          {row["Size (Shares)"] && <span className="ml-1">（{row["Size (Shares)"]}株）</span>}
                        </p>
                        {row["Thesis (投資仮説)"] && <p className="text-slate-500 line-clamp-2">{row["Thesis (投資仮説)"]}</p>}
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* Core positions */}
            {data.corePositions.length > 0 && (
              <section className="bg-slate-900/50 border border-slate-800 rounded-xl p-4">
                <h2 className="text-slate-200 font-semibold text-sm mb-3">🏛️ コア資産（積立）</h2>
                <div className="space-y-2">
                  {data.corePositions.map((row, i) => {
                    const nameKey = Object.keys(row)[0];
                    return (
                      <div
                        key={i}
                        className="flex items-center justify-between bg-slate-800/60 border border-slate-700/60 rounded-lg p-3 gap-2"
                      >
                        <span className="text-slate-200 text-xs sm:text-sm flex-1">{row[nameKey]}</span>
                        <PnlBadge value={row["損益率"]} />
                      </div>
                    );
                  })}
                </div>
              </section>
            )}

            {/* Summary */}
            {data.summaryBullets.length > 0 && (
              <section className="bg-slate-900/50 border border-slate-800 rounded-xl p-4">
                <h2 className="text-slate-200 font-semibold text-sm mb-3">📋 サマリー</h2>
                <ul className="text-xs sm:text-sm text-slate-300 space-y-1.5 list-disc list-inside">
                  {data.summaryBullets.map((b, i) => (
                    <li key={i}>{b}</li>
                  ))}
                </ul>
              </section>
            )}

            {/* Recent investment log */}
            {data.logEntries.length > 0 && (
              <section className="bg-slate-900/50 border border-slate-800 rounded-xl p-4">
                <h2 className="text-slate-200 font-semibold text-sm mb-3">📝 最近の投資ログ</h2>
                <div className="space-y-2">
                  {data.logEntries.map((entry) => (
                    <div
                      key={entry.fileName}
                      className="flex items-center justify-between text-xs sm:text-sm bg-slate-800/40 rounded-lg px-3 py-2"
                    >
                      <span className="text-slate-300 truncate">{entry.title}</span>
                      <span className="text-slate-500 shrink-0 ml-2">{entry.date}</span>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* Review checklist */}
            {data.reviewChecklist.length > 0 && (
              <section className="bg-slate-900/50 border border-slate-800 rounded-xl p-4">
                <h2 className="text-slate-200 font-semibold text-sm mb-3">✅ 次回レビューチェックリスト</h2>
                <ul className="text-xs sm:text-sm text-slate-300 space-y-1.5">
                  {data.reviewChecklist.map((item, i) => (
                    <li key={i} className="flex items-start gap-2">
                      <span className="text-slate-600 mt-0.5">☐</span>
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
