"use client";

import { useMemo, useState } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { TrendingUp } from "lucide-react";
import { CHART_RANGES, ChartRange, ValuePoint, formatJpy, formatPct } from "@/app/lib/investing/types";
import { formatAsOf } from "@/app/lib/freshness";
import { Card, CardHeader, EmptyState, toneOf } from "./ui";

/** 同じ日に複数点（日中スナップショット）が並ぶため、X軸のキーは時刻込みで作る */
type ChartPoint = ValuePoint & { key: string };

function toChartPoints(points: ValuePoint[]): ChartPoint[] {
  return points.map((p) => ({ ...p, key: p.at ?? p.date }));
}

function filterByRange(points: ChartPoint[], range: ChartRange): ChartPoint[] {
  const spec = CHART_RANGES.find((r) => r.id === range);
  if (!spec?.days) return points;
  const cutoffMs = Date.now() - spec.days * 24 * 60 * 60 * 1000;
  const filtered = points.filter((p) => {
    const ms = new Date(p.at ?? `${p.date}T23:59:59+09:00`).getTime();
    return Number.isFinite(ms) ? ms >= cutoffMs : false;
  });
  // 期間内に点が少なすぎる場合は全期間を見せる（空グラフを避ける）
  return filtered.length >= 2 ? filtered : points;
}

function TooltipCard({
  active,
  payload,
}: {
  active?: boolean;
  payload?: { payload: ChartPoint }[];
}) {
  if (!active || !payload?.length) return null;
  const point = payload[0].payload;
  return (
    <div className="rounded-xl border border-hairline bg-ink-raised px-3 py-2 shadow-lift">
      <p className="text-[11px] text-sub">{formatAsOf(point.at ?? point.date)}</p>
      <p className="text-sm font-semibold text-white">{formatJpy(point.totalValueJpy)}</p>
    </div>
  );
}

export function AssetChart({ points }: { points: ValuePoint[] }) {
  const [range, setRange] = useState<ChartRange>("1M");
  const chartPoints = useMemo(() => toChartPoints(points), [points]);
  const data = useMemo(() => filterByRange(chartPoints, range), [chartPoints, range]);
  // 短期レンジは日中スナップショットが主役になるので時刻まで出す
  const showTime = range === "1D" || range === "1W";

  const change = useMemo(() => {
    if (data.length < 2) return { diff: null as number | null, pct: null as number | null };
    const first = data[0].totalValueJpy;
    const last = data[data.length - 1].totalValueJpy;
    return { diff: last - first, pct: first > 0 ? ((last - first) / first) * 100 : null };
  }, [data]);

  const stroke = (change.diff ?? 0) < 0 ? "#EF4444" : "#4F8CFF";

  return (
    <Card>
      <CardHeader
        title="資産推移"
        hint={
          data.length >= 2
            ? `${data[0].date} 〜 ${data[data.length - 1].date}（${data.length}点）`
            : "市場時間中のスナップショットと表示時の記録が溜まると伸びます"
        }
        action={
          <div className="flex flex-wrap gap-1 rounded-xl bg-white/[0.04] p-1">
            {CHART_RANGES.map((option) => (
              <button
                key={option.id}
                onClick={() => setRange(option.id)}
                className={`rounded-lg px-2.5 py-1 text-[11px] font-medium transition-colors ${
                  range === option.id
                    ? "bg-brand text-white shadow-sm"
                    : "text-sub hover:text-white"
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
        }
      />

      {data.length < 2 ? (
        <EmptyState
          icon={<TrendingUp className="h-7 w-7" />}
          title="推移データを蓄積中です"
          description="証券会社から過去の時系列は取得できないため、市場時間中のスナップショットと画面表示時の総評価額を実測して積み上げています。時間が経つほどグラフが滑らかになります。"
        />
      ) : (
        <>
          <div className="mb-3 flex items-baseline gap-2">
            <span className={`text-sm font-semibold ${toneOf(change.diff)}`}>
              {formatJpy(change.diff, { sign: true })}
            </span>
            <span className={`text-xs ${toneOf(change.pct)}`}>
              {formatPct(change.pct, { sign: true })}
            </span>
            <span className="text-[11px] text-sub">期間騰落</span>
          </div>

          <div className="h-[240px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="assetFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={stroke} stopOpacity={0.3} />
                    <stop offset="100%" stopColor={stroke} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="rgba(255,255,255,0.06)" vertical={false} />
                <XAxis
                  dataKey="key"
                  tick={{ fontSize: 11, fill: "#94A3B8" }}
                  tickLine={false}
                  axisLine={false}
                  minTickGap={28}
                  tickFormatter={(value: string) =>
                    showTime
                      ? formatAsOf(value)
                      : formatAsOf(value.slice(0, 10))
                  }
                />
                <YAxis
                  tick={{ fontSize: 11, fill: "#94A3B8" }}
                  tickLine={false}
                  axisLine={false}
                  width={52}
                  domain={["dataMin - dataMin * 0.02", "dataMax + dataMax * 0.01"]}
                  tickFormatter={(value: number) =>
                    value >= 10000 ? `${Math.round(value / 10000)}万` : String(value)
                  }
                />
                <Tooltip content={<TooltipCard />} cursor={{ stroke: "rgba(255,255,255,0.2)" }} />
                <Area
                  type="monotone"
                  dataKey="totalValueJpy"
                  stroke={stroke}
                  strokeWidth={2}
                  fill="url(#assetFill)"
                  animationDuration={800}
                  dot={data.length <= 20 ? { r: 2.5, fill: stroke, strokeWidth: 0 } : false}
                  activeDot={{ r: 4, fill: stroke, stroke: "#0B1220", strokeWidth: 2 }}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </>
      )}
    </Card>
  );
}
