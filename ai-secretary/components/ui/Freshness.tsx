"use client";

/**
 * 更新鮮度の共通表示（TASK-C2）
 *
 * 「更新時刻 + データソース + 鮮度区分」を、ノート事業部・株式会社事業部で
 * 同じ見た目・同じ語彙で出すための部品。各事業部で独自の鮮度表現を作らないこと。
 */

import {
  DataFreshness,
  FRESHNESS_LABELS,
  FreshnessLevel,
  formatAsOf,
  relativeAge,
} from "@/app/lib/freshness";

const LEVEL_STYLE: Record<FreshnessLevel, string> = {
  live: "bg-gain/10 text-gain border-gain/25",
  delayed: "bg-brand-soft text-brand border-brand/25",
  daily: "bg-white/5 text-slate-300 border-hairline",
  stale: "bg-loss/10 text-loss border-loss/25",
  none: "bg-white/5 text-sub border-hairline",
};

const LEVEL_DOT: Record<FreshnessLevel, string> = {
  live: "bg-gain",
  delayed: "bg-brand",
  daily: "bg-slate-400",
  stale: "bg-loss",
  none: "bg-sub",
};

/** 鮮度区分だけの極小バッジ（テーブルの行など、場所が無いところ用） */
export function FreshnessDot({ freshness }: { freshness?: DataFreshness | null }) {
  if (!freshness) return null;
  const title = [
    FRESHNESS_LABELS[freshness.level],
    freshness.source,
    formatAsOf(freshness.asOf),
    freshness.note,
  ]
    .filter(Boolean)
    .join(" · ");
  return (
    <span
      title={title}
      aria-label={title}
      className={`inline-block h-1.5 w-1.5 shrink-0 rounded-full ${LEVEL_DOT[freshness.level]}`}
    />
  );
}

/**
 * 鮮度バッジ。カードの見出し脇に置く。
 * compact=true では区分のみ、false では「ソース · 時刻」まで出す。
 */
export function FreshnessBadge({
  freshness,
  compact = false,
}: {
  freshness?: DataFreshness | null;
  compact?: boolean;
}) {
  if (!freshness) return null;
  const { level, source, asOf, note } = freshness;

  return (
    <span
      title={note ?? undefined}
      className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-medium ${LEVEL_STYLE[level]}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${LEVEL_DOT[level]}`} />
      {FRESHNESS_LABELS[level]}
      {!compact && (
        <span className="font-normal opacity-80">
          · {source} · {formatAsOf(asOf)}
        </span>
      )}
    </span>
  );
}

/** カード下部に置く1行の説明（バッジより情報量が要るとき） */
export function FreshnessLine({ freshness }: { freshness?: DataFreshness | null }) {
  if (!freshness) return null;
  return (
    <p className="mt-2 text-[11px] leading-relaxed text-sub">
      <FreshnessBadge freshness={freshness} compact />
      <span className="ml-2">
        {freshness.source} · {formatAsOf(freshness.asOf)}（{relativeAge(freshness.asOf)}）
      </span>
      {freshness.note && <span className="ml-1 text-loss/80">{freshness.note}</span>}
    </p>
  );
}
