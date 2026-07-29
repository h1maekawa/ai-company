"use client";

/**
 * 投資ダッシュボード用のUI部品。
 * 汎用部分は components/ui/primitives.tsx へ移し、ここでは再輸出と
 * 投資固有の SentimentBadge だけを持つ。
 */

import { Sentiment, SENTIMENT_LABELS } from "@/app/lib/investing/types";

export {
  Card,
  CardHeader,
  useCountUp,
  Badge,
  toneOf,
  Skeleton,
  EmptyState,
} from "@/components/ui/primitives";

const SENTIMENT_STYLE: Record<Sentiment, string> = {
  positive: "bg-gain/10 text-gain border-gain/25",
  neutral: "bg-white/5 text-sub border-hairline",
  negative: "bg-loss/10 text-loss border-loss/25",
};

/** ニュースの市場センチメント表示（投資部門でのみ使う） */
export function SentimentBadge({ sentiment }: { sentiment: Sentiment | null }) {
  if (!sentiment) return null;
  return (
    <span
      className={`shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-medium ${SENTIMENT_STYLE[sentiment]}`}
    >
      {SENTIMENT_LABELS[sentiment]}
    </span>
  );
}
