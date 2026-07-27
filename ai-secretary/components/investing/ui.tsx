"use client";

import { motion } from "framer-motion";
import { ReactNode, useEffect, useRef, useState } from "react";
import { Sentiment, SENTIMENT_LABELS } from "@/app/lib/investing/types";

/* ─── Card ───────────────────────────────────────────── */

export function Card({
  children,
  className = "",
  padded = true,
  delay = 0,
}: {
  children: ReactNode;
  className?: string;
  padded?: boolean;
  delay?: number;
}) {
  return (
    <motion.section
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay, ease: [0.22, 1, 0.36, 1] }}
      className={`rounded-2xl border border-hairline bg-ink-card shadow-card ${padded ? "p-5" : ""} ${className}`}
    >
      {children}
    </motion.section>
  );
}

export function CardHeader({
  title,
  action,
  hint,
}: {
  title: string;
  action?: ReactNode;
  hint?: string;
}) {
  return (
    <div className="mb-4 flex items-start justify-between gap-3">
      <div>
        <h2 className="text-[15px] font-semibold text-white">{title}</h2>
        {hint && <p className="mt-0.5 text-xs text-sub">{hint}</p>}
      </div>
      {action}
    </div>
  );
}

/* ─── 数値アニメーション ─────────────────────────────── */

export function useCountUp(target: number | null, duration = 700): number | null {
  const [value, setValue] = useState<number | null>(target);
  const fromRef = useRef(0);

  useEffect(() => {
    if (target === null) {
      setValue(null);
      return;
    }
    const from = fromRef.current;
    const start = performance.now();
    let frame = 0;

    const tick = (now: number) => {
      const progress = Math.min(1, (now - start) / duration);
      // easeOutCubic
      const eased = 1 - Math.pow(1 - progress, 3);
      setValue(from + (target - from) * eased);
      if (progress < 1) frame = requestAnimationFrame(tick);
      else fromRef.current = target;
    };

    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [target, duration]);

  return value;
}

/* ─── Badge ──────────────────────────────────────────── */

const SENTIMENT_STYLE: Record<Sentiment, string> = {
  positive: "bg-gain/10 text-gain border-gain/25",
  neutral: "bg-white/5 text-sub border-hairline",
  negative: "bg-loss/10 text-loss border-loss/25",
};

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

export function Badge({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: "neutral" | "brand" | "gain" | "loss";
}) {
  const styles = {
    neutral: "bg-white/5 text-sub border-hairline",
    brand: "bg-brand-soft text-brand border-brand/25",
    gain: "bg-gain/10 text-gain border-gain/25",
    loss: "bg-loss/10 text-loss border-loss/25",
  };
  return (
    <span className={`rounded-full border px-2 py-0.5 text-[11px] font-medium ${styles[tone]}`}>
      {children}
    </span>
  );
}

/* ─── 損益の色分け ───────────────────────────────────── */

export function toneOf(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "text-sub";
  if (value > 0) return "text-gain";
  if (value < 0) return "text-loss";
  return "text-white";
}

/* ─── Skeleton ───────────────────────────────────────── */

export function Skeleton({ className = "" }: { className?: string }) {
  return (
    <div className={`relative overflow-hidden rounded-lg bg-white/5 ${className}`}>
      <div className="absolute inset-0 -translate-x-full animate-shimmer bg-gradient-to-r from-transparent via-white/10 to-transparent" />
    </div>
  );
}

/* ─── 空状態 ─────────────────────────────────────────── */

export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-10 text-center">
      {icon && <div className="text-sub/60">{icon}</div>}
      <p className="text-sm font-medium text-slate-300">{title}</p>
      {description && <p className="max-w-sm text-xs leading-relaxed text-sub">{description}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}
