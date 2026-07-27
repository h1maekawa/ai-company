"use client";

import { motion } from "framer-motion";
import { ValuePoint, formatJpy, formatPct } from "@/app/lib/investing/types";
import { useCountUp, toneOf } from "./ui";

/** カード右上に置く極小スパークライン（Rechartsを使わずSVGで軽量に描く） */
function Sparkline({ points, tone }: { points: ValuePoint[]; tone: "gain" | "loss" | "brand" }) {
  if (points.length < 2) return null;

  const width = 56;
  const height = 32;
  const values = points.map((p) => p.totalValueJpy);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;

  const path = points
    .map((point, index) => {
      const x = (index / (points.length - 1)) * width;
      const y = height - ((point.totalValueJpy - min) / span) * height;
      return `${index === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");

  const stroke = tone === "gain" ? "#22C55E" : tone === "loss" ? "#EF4444" : "#4F8CFF";
  const gradientId = `spark-${tone}`;

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="overflow-visible">
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={stroke} stopOpacity="0.28" />
          <stop offset="100%" stopColor={stroke} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={`${path} L${width},${height} L0,${height} Z`} fill={`url(#${gradientId})`} />
      <motion.path
        d={path}
        fill="none"
        stroke={stroke}
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
        initial={{ pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={{ duration: 0.9, ease: "easeOut" }}
      />
    </svg>
  );
}

export function StatCard({
  label,
  value,
  delta,
  deltaPct,
  format = "jpy",
  spark,
  delay = 0,
  emphasis = false,
}: {
  label: string;
  value: number | null;
  /** 差分（前日比・含み益など）。null なら非表示 */
  delta?: number | null;
  deltaPct?: number | null;
  format?: "jpy" | "pct" | "count";
  spark?: ValuePoint[];
  delay?: number;
  emphasis?: boolean;
}) {
  const animated = useCountUp(value);
  const display =
    animated === null
      ? "—"
      : format === "pct"
        ? formatPct(animated, { sign: true })
        : format === "count"
          ? `${Math.round(animated).toLocaleString("ja-JP")}件`
          : formatJpy(animated);

  const tone = format === "pct" ? toneOf(value) : emphasis ? toneOf(value) : "text-white";
  const sparkTone: "gain" | "loss" | "brand" =
    (delta ?? 0) > 0 ? "gain" : (delta ?? 0) < 0 ? "loss" : "brand";

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay, ease: [0.22, 1, 0.36, 1] }}
      className="group rounded-2xl border border-hairline bg-ink-card p-4 shadow-card transition-all hover:border-white/[0.14] hover:shadow-lift sm:p-5"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs text-sub">{label}</p>
          <p
            className={`mt-1.5 text-[20px] font-semibold leading-tight tracking-tight tabular-nums ${tone}`}
          >
            {display}
          </p>
          {(delta !== undefined && delta !== null) || (deltaPct !== undefined && deltaPct !== null) ? (
            <p className={`mt-1 text-xs font-medium ${toneOf(delta ?? deltaPct)}`}>
              {delta !== undefined && delta !== null ? formatJpy(delta, { sign: true }) : ""}
              {delta !== undefined && delta !== null && deltaPct !== undefined && deltaPct !== null
                ? " "
                : ""}
              {deltaPct !== undefined && deltaPct !== null
                ? `(${formatPct(deltaPct, { sign: true })})`
                : ""}
            </p>
          ) : null}
        </div>

        {spark && spark.length >= 2 && (
          <div className="shrink-0 pt-1">
            <Sparkline points={spark} tone={sparkTone} />
          </div>
        )}
      </div>
    </motion.div>
  );
}
