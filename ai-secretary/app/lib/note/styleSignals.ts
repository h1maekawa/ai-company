/**
 * Style Signal（要件P0.2）。
 *
 * 文章の型を決定的に分類する。AIには判定させない
 * （同じ文章なら毎回同じ分類になるようにし、コストもかけない）。
 */

import { contentPerformanceScore } from "./operations";
import type { ContentPerformance, PerformanceWeights } from "./research/types";

export type StyleBucket = {
  openingBucket: "question" | "number-lead" | "short-hook" | "statement";
  endingBucket: "question" | "open-ended" | "resolved";
  lineBreakBucket: "dense" | "spaced" | "single";
  sentenceLengthBucket: "short" | "medium" | "long";
  hasQuestion: boolean;
};

const OPEN_ENDED_MARKERS = /\.\.\.|…|かもしれない|かも$|気がする|まだ分からない|まだ迷って/;

export function classifyStyle(text: string): StyleBucket {
  const lines = text.trim().split("\n").filter((l) => l.trim().length > 0);
  const firstLine = lines[0] ?? "";
  const lastLine = lines[lines.length - 1] ?? "";

  const openingBucket: StyleBucket["openingBucket"] = /[?？]\s*$/.test(firstLine)
    ? "question"
    : /^[0-9０-９]/.test(firstLine)
      ? "number-lead"
      : firstLine.length <= 15
        ? "short-hook"
        : "statement";

  const endingBucket: StyleBucket["endingBucket"] = /[?？]\s*$/.test(lastLine)
    ? "question"
    : OPEN_ENDED_MARKERS.test(lastLine)
      ? "open-ended"
      : "resolved";

  const paragraphs = text.split(/\n\s*\n/).filter((p) => p.trim().length > 0).length;
  const lineBreakBucket: StyleBucket["lineBreakBucket"] =
    paragraphs >= 3 ? "spaced" : paragraphs === 2 ? "dense" : "single";

  const sentences = text.split(/[。！？\n]/).map((s) => s.trim()).filter(Boolean);
  const avgLen = sentences.length > 0 ? sentences.reduce((a, s) => a + s.length, 0) / sentences.length : text.length;
  const sentenceLengthBucket: StyleBucket["sentenceLengthBucket"] =
    avgLen <= 20 ? "short" : avgLen <= 40 ? "medium" : "long";

  return {
    openingBucket,
    endingBucket,
    lineBreakBucket,
    sentenceLengthBucket,
    hasQuestion: /[?？]/.test(text),
  };
}

/* ─── Performance → Style自己改善（要件P0.2） ───────────── */

export type StyleDimensionKey =
  | "openingBucket"
  | "endingBucket"
  | "lineBreakBucket"
  | "sentenceLengthBucket"
  | "question"
  | "cta"
  | "pattern"
  | "investmentContent";

export type StyleSignalGroup = {
  dimension: StyleDimensionKey;
  value: string;
  sampleSize: number;
  averageScore: number;
  winning: boolean;
};

const MIN_STYLE_SAMPLE = 3;
const WINNING_STYLE_SCORE = 55;

function bucketsFor(record: ContentPerformance): Partial<Record<StyleDimensionKey, string>> {
  return {
    openingBucket: record.openingBucket,
    endingBucket: record.endingBucket,
    lineBreakBucket: record.lineBreakBucket,
    sentenceLengthBucket: record.sentenceLengthBucket,
    question: record.hasQuestion === undefined ? undefined : record.hasQuestion ? "question" : "no-question",
    cta: record.hasCta === undefined ? undefined : record.hasCta ? "cta" : "no-cta",
    pattern: record.pattern,
    investmentContent: record.trendClusterId
      ? record.trendClusterId.startsWith("investment-")
        ? "investment"
        : "non-investment"
      : undefined,
  };
}

/**
 * X投稿のContentPerformanceをStyle次元ごとに集計する（既存aggregateGrowthPatternsと同じ決定的計算）。
 * サンプル不足の値は勝敗を判定しない（データを捏造しない）。
 */
export function aggregateStyleSignals(
  records: ContentPerformance[],
  weights: PerformanceWeights
): StyleSignalGroup[] {
  const groups = new Map<string, number[]>();
  for (const record of records.filter((r) => r.platform === "x")) {
    const score = contentPerformanceScore(record, weights);
    const buckets = bucketsFor(record);
    for (const [dimension, value] of Object.entries(buckets)) {
      if (!value) continue;
      const key = `${dimension}:${value}`;
      groups.set(key, [...(groups.get(key) ?? []), score]);
    }
  }
  return [...groups.entries()]
    .map(([key, scores]) => {
      const [dimension, value] = key.split(":") as [StyleDimensionKey, string];
      const averageScore = Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 10) / 10;
      return {
        dimension,
        value,
        sampleSize: scores.length,
        averageScore,
        winning: scores.length >= MIN_STYLE_SAMPLE && averageScore >= WINNING_STYLE_SCORE,
      };
    })
    .sort((a, b) => b.averageScore - a.averageScore);
}
