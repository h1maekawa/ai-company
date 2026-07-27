"use client";

import Link from "next/link";
import { Briefcase, ChevronRight } from "lucide-react";
import { Position, formatJpy, formatPct } from "@/app/lib/investing/types";
import { Card, CardHeader, EmptyState, toneOf } from "./ui";

/** ロゴ画像は持たないので、ティッカー由来の配色モノグラムで代用する */
function Monogram({ code }: { code: string }) {
  const palette = ["#4F8CFF", "#22C55E", "#A78BFA", "#F59E0B", "#F472B6", "#38BDF8"];
  const hash = [...code].reduce((sum, char) => sum + char.charCodeAt(0), 0);
  const color = palette[hash % palette.length];
  return (
    <span
      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[11px] font-bold"
      style={{ backgroundColor: `${color}22`, color, border: `1px solid ${color}44` }}
    >
      {code.slice(0, 2).toUpperCase()}
    </span>
  );
}

/** 損益率を視覚化する小さなバー（実データのpnlPctのみを使う） */
function PnlBar({ pct }: { pct: number | null }) {
  if (pct === null) return <span className="text-xs text-sub">—</span>;
  const magnitude = Math.min(100, Math.abs(pct));
  const color = pct >= 0 ? "#22C55E" : "#EF4444";
  return (
    <div className="h-1.5 w-16 overflow-hidden rounded-full bg-white/[0.06]">
      <div
        className="h-full rounded-full transition-all"
        style={{ width: `${magnitude}%`, backgroundColor: color }}
      />
    </div>
  );
}

export function HoldingsTable({
  positions,
  limit,
  title = "保有株",
}: {
  positions: Position[];
  limit?: number;
  title?: string;
}) {
  const sorted = [...positions].sort(
    (a, b) => (b.marketValueJpy ?? 0) - (a.marketValueJpy ?? 0)
  );
  const rows = limit ? sorted.slice(0, limit) : sorted;

  return (
    <Card padded={false}>
      <div className="px-5 pt-5">
        <CardHeader
          title={limit ? `${title}TOP${limit}` : title}
          action={
            limit && positions.length > limit ? (
              <Link
                href="/investing/holdings"
                className="text-xs font-medium text-brand hover:underline"
              >
                すべて見る
              </Link>
            ) : undefined
          }
        />
      </div>

      {rows.length === 0 ? (
        <div className="px-5 pb-5">
          <EmptyState
            icon={<Briefcase className="h-7 w-7" />}
            title="保有データがありません"
            description="楽天証券のCSVを取り込むか、positions.md に保有を記録すると一覧に表示されます。"
          />
        </div>
      ) : (
        <>
          {/* デスクトップ: テーブル */}
          <div className="hidden overflow-x-auto sm:block">
            <table className="w-full min-w-[680px] text-sm">
              <thead>
                <tr className="border-y border-hairline text-[11px] text-sub">
                  <th className="px-5 py-2.5 text-left font-medium">銘柄</th>
                  <th className="px-3 py-2.5 text-right font-medium">保有数</th>
                  <th className="px-3 py-2.5 text-right font-medium">評価額</th>
                  <th className="px-3 py-2.5 text-right font-medium">含み益</th>
                  <th className="px-3 py-2.5 text-right font-medium">損益率</th>
                  <th className="px-5 py-2.5 text-right font-medium">推移</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((position) => (
                  <tr
                    key={position.code}
                    className="group border-b border-hairline/60 transition-colors last:border-0 hover:bg-white/[0.03]"
                  >
                    <td className="px-5 py-3">
                      <Link
                        href={`/investing/holdings/${encodeURIComponent(position.code)}`}
                        className="flex items-center gap-3"
                      >
                        <Monogram code={position.code} />
                        <span className="min-w-0">
                          <span className="block max-w-[220px] truncate font-medium text-white group-hover:text-brand">
                            {position.name}
                          </span>
                          <span className="block text-[11px] text-sub">{position.code}</span>
                        </span>
                      </Link>
                    </td>
                    <td className="px-3 py-3 text-right tabular-nums text-slate-300">
                      {position.quantity !== null
                        ? position.quantity.toLocaleString("ja-JP")
                        : "—"}
                    </td>
                    <td className="px-3 py-3 text-right tabular-nums font-medium text-white">
                      {formatJpy(position.marketValueJpy)}
                    </td>
                    <td
                      className={`px-3 py-3 text-right tabular-nums font-medium ${toneOf(position.pnlJpy)}`}
                    >
                      {formatJpy(position.pnlJpy, { sign: true })}
                    </td>
                    <td
                      className={`px-3 py-3 text-right tabular-nums font-medium ${toneOf(position.pnlPct)}`}
                    >
                      {formatPct(position.pnlPct, { sign: true })}
                    </td>
                    <td className="px-5 py-3">
                      <div className="flex justify-end">
                        <PnlBar pct={position.pnlPct} />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* モバイル: カード */}
          <ul className="divide-y divide-hairline/60 sm:hidden">
            {rows.map((position) => (
              <li key={position.code}>
                <Link
                  href={`/investing/holdings/${encodeURIComponent(position.code)}`}
                  className="flex items-center gap-3 px-5 py-3 active:bg-white/[0.04]"
                >
                  <Monogram code={position.code} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-white">{position.name}</p>
                    <p className="text-[11px] text-sub">
                      {position.code}
                      {position.quantity !== null
                        ? ` · ${position.quantity.toLocaleString("ja-JP")}`
                        : ""}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-sm font-medium tabular-nums text-white">
                      {formatJpy(position.marketValueJpy)}
                    </p>
                    <p className={`text-[11px] tabular-nums ${toneOf(position.pnlPct)}`}>
                      {formatPct(position.pnlPct, { sign: true })}
                    </p>
                  </div>
                  <ChevronRight className="h-4 w-4 shrink-0 text-sub" />
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}
    </Card>
  );
}
