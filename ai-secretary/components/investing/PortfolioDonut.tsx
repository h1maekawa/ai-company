"use client";

import { useState } from "react";
import { Cell, Pie, PieChart, ResponsiveContainer } from "recharts";
import { PieChart as PieIcon } from "lucide-react";
import { PortfolioSummary, formatJpy, formatPct } from "@/app/lib/investing/types";
import { Card, CardHeader, EmptyState } from "./ui";

const SLICE_COLORS = ["#4F8CFF", "#22C55E", "#A78BFA", "#F59E0B", "#F472B6", "#38BDF8"];

export function PortfolioDonut({ summary }: { summary: PortfolioSummary }) {
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const slices = summary.allocation;

  if (slices.length === 0) {
    return (
      <Card>
        <CardHeader title="ポートフォリオ" />
        <EmptyState
          icon={<PieIcon className="h-7 w-7" />}
          title="保有データがありません"
          description="楽天証券のCSVを取り込むか、positions.md に保有を記録すると内訳が表示されます。"
        />
      </Card>
    );
  }

  const active = activeIndex !== null ? slices[activeIndex] : null;

  return (
    <Card>
      <CardHeader title="ポートフォリオ" hint="資産クラス別の内訳" />

      <div className="relative">
        <div className="h-[168px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={slices}
                dataKey="valueJpy"
                nameKey="label"
                innerRadius={54}
                outerRadius={78}
                paddingAngle={2}
                stroke="none"
                isAnimationActive={false}
                onMouseEnter={(_, index) => setActiveIndex(index)}
                onMouseLeave={() => setActiveIndex(null)}
              >
                {slices.map((slice, index) => (
                  <Cell
                    key={slice.assetClass}
                    fill={SLICE_COLORS[index % SLICE_COLORS.length]}
                    opacity={activeIndex === null || activeIndex === index ? 1 : 0.4}
                    className="cursor-pointer transition-opacity"
                  />
                ))}
              </Pie>
            </PieChart>
          </ResponsiveContainer>
        </div>

        {/* 中央のラベル */}
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <p className="text-[11px] text-sub">{active ? active.label : "評価額合計"}</p>
          <p className="text-base font-semibold text-white">
            {formatJpy(active ? active.valueJpy : summary.totalValueJpy)}
          </p>
          {active && <p className="text-[11px] text-brand">{formatPct(active.pct)}</p>}
        </div>
      </div>

      <ul className="mt-4 space-y-2">
        {slices.map((slice, index) => (
          <li
            key={slice.assetClass}
            onMouseEnter={() => setActiveIndex(index)}
            onMouseLeave={() => setActiveIndex(null)}
            className="flex items-center gap-2.5 text-xs"
          >
            <span
              className="h-2.5 w-2.5 shrink-0 rounded-full"
              style={{ backgroundColor: SLICE_COLORS[index % SLICE_COLORS.length] }}
            />
            <span className="flex-1 truncate text-slate-300">{slice.label}</span>
            <span className="tabular-nums text-sub">{formatPct(slice.pct)}</span>
          </li>
        ))}
      </ul>
    </Card>
  );
}
