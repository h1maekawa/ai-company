import {
  buildFunnel,
  contentPerformanceScore,
  diagnoseFunnel,
  evaluateWinningTopics,
} from "./operations";
import type {
  ContentGrowthStrategy,
  ContentPerformance,
  PerformanceWeights,
  PurposeMix,
  StrategyConfidence,
  WinningTopicPolicy,
} from "./research/types";

export type MetricSummary = {
  postCount: number;
  impressions?: number;
  engagements?: number;
  linkClicks?: number;
  profileVisits?: number;
  followersGained?: number;
};

export type NoteMetricSummary = {
  articleCount: number;
  views?: number;
  likes?: number;
  sales?: number;
  revenue?: number;
  followers?: number;
};

export type PeriodComparison = {
  yesterday: MetricSummary;
  last7Days: MetricSummary;
  previous7Days: MetricSummary;
  last28Days: MetricSummary;
  movingAverage7d?: number;
  movingAverage28d?: number;
};

export type GrowthPattern = {
  key: string;
  topicId: string;
  genreId: string;
  purpose: string;
  pattern: string;
  draftType: string;
  postingSlot: string;
  cta: string;
  destination: string;
  lengthBucket: string;
  sampleSize: number;
  averageScore: number;
  winning: boolean;
};

export type AppliedStrategyChange = {
  field: string;
  before: unknown;
  after: unknown;
  reason: string;
};

export type DailyGrowthReview = {
  date: string;
  measuredThrough: string;
  dataFreshness: { x: "fresh" | "partial"; note: "fresh" | "stale" | "unavailable" };
  xSummary: MetricSummary;
  noteSummary: NoteMetricSummary;
  comparisons: PeriodComparison;
  funnel: ReturnType<typeof buildFunnel>;
  winningTopics: ReturnType<typeof evaluateWinningTopics>;
  decliningTopics: ReturnType<typeof evaluateWinningTopics>;
  winningPatterns: GrowthPattern[];
  losingPatterns: GrowthPattern[];
  bestPurposes: string[];
  bestPostingSlots: string[];
  monetizationSummary: { revenue?: number; paidPurchases?: number; freeToPaidConversion?: number };
  bottleneck: string;
  insights: string[];
  experiments: string[];
  strategyBefore: ContentGrowthStrategy;
  strategyAfter: ContentGrowthStrategy;
  appliedChanges: AppliedStrategyChange[];
  skippedChanges: string[];
  confidence: StrategyConfidence;
  noteApprovalPriorities: { articleId: string; title: string; reason: string; priceSuggestion?: string }[];
};

const DAY = 86_400_000;

function inWindow(records: ContentPerformance[], now: Date, startDaysAgo: number, endDaysAgo = 0) {
  const end = now.getTime() - endDaysAgo * DAY;
  const start = now.getTime() - startDaysAgo * DAY;
  return records.filter((record) => {
    const at = new Date(record.publishedAt).getTime();
    return Number.isFinite(at) && at >= start && at < end;
  });
}

function sumObserved(records: ContentPerformance[], getter: (record: ContentPerformance) => number | undefined) {
  const values = records.map(getter).filter((value): value is number => value !== undefined);
  return values.length ? values.reduce((sum, value) => sum + value, 0) : undefined;
}

export function summarizeX(records: ContentPerformance[]): MetricSummary {
  const x = records.filter((record) => record.platform === "x");
  return {
    postCount: x.length,
    impressions: sumObserved(x, (record) => record.impressions),
    engagements: sumObserved(x, (record) => record.engagements ?? (
      [record.likes, record.replies, record.reposts].some((value) => value !== undefined)
        ? (record.likes ?? 0) + (record.replies ?? 0) + (record.reposts ?? 0)
        : undefined
    )),
    linkClicks: sumObserved(x, (record) => record.linkClicks ?? record.urlClicks ?? record.noteClicks),
    profileVisits: sumObserved(x, (record) => record.profileVisits),
    followersGained: sumObserved(x, (record) => record.followersGained),
  };
}

export function summarizeNote(records: ContentPerformance[]): NoteMetricSummary {
  const note = records.filter((record) => record.platform === "note");
  return {
    articleCount: note.length,
    views: sumObserved(note, (record) => record.noteViews),
    likes: sumObserved(note, (record) => record.noteLikes),
    sales: sumObserved(note, (record) => record.noteSales ?? record.paidPurchases),
    revenue: sumObserved(note, (record) => record.noteRevenue),
    followers: sumObserved(note, (record) => record.noteFollowers),
  };
}

export function lengthBucket(length?: number): string {
  if (length === undefined) return "unavailable";
  if (length <= 160) return "0-160";
  if (length <= 220) return "161-220";
  if (length <= 250) return "221-250";
  return "251-280";
}

export function aggregateGrowthPatterns(
  records: ContentPerformance[],
  weights: PerformanceWeights,
  minimumSample = 3
): GrowthPattern[] {
  const groups = new Map<string, { record: ContentPerformance; scores: number[] }>();
  for (const record of records.filter((item) => item.platform === "x")) {
    const fields = [
      record.trendClusterId ?? "unknown-topic", record.genreId, record.purpose,
      record.pattern ?? "unknown-pattern", record.draftType ?? "unknown-draft",
      record.postingSlot ?? "unknown-slot", record.hasCta ? "cta" : "no-cta",
      record.destination ?? (record.noteClicks !== undefined ? "note" : "none"),
      lengthBucket(record.weightedLength),
    ];
    const key = fields.join("|");
    const group = groups.get(key) ?? { record, scores: [] };
    group.scores.push(contentPerformanceScore(record, weights));
    groups.set(key, group);
  }
  return [...groups.entries()].map(([key, group]) => {
    const record = group.record;
    const averageScore = Math.round(group.scores.reduce((a, b) => a + b, 0) / group.scores.length * 10) / 10;
    return {
      key, topicId: record.trendClusterId ?? "unknown-topic", genreId: record.genreId,
      purpose: record.purpose, pattern: record.pattern ?? "unknown-pattern",
      draftType: record.draftType ?? "unknown-draft", postingSlot: record.postingSlot ?? "unknown-slot",
      cta: record.hasCta ? "cta" : "no-cta", destination: record.destination ?? "none",
      lengthBucket: lengthBucket(record.weightedLength), sampleSize: group.scores.length,
      averageScore, winning: group.scores.length >= minimumSample && averageScore >= 55,
    };
  }).sort((a, b) => b.averageScore - a.averageScore);
}

export function growthConfidence(sampleSize: number): StrategyConfidence {
  return sampleSize >= 10 ? "high" : sampleSize >= 3 ? "medium" : "low";
}

const PURPOSE_BOUNDS: Record<keyof PurposeMix, [number, number]> = {
  reach: [50, 80], noteBridge: [10, 35], monetize: [5, 20],
};

function clamp(value: number, [min, max]: [number, number]) {
  return Math.min(max, Math.max(min, value));
}

export function improveStrategy(
  before: ContentGrowthStrategy,
  records: ContentPerformance[],
  weights: PerformanceWeights,
  confidence: StrategyConfidence,
  winningTopics: ReturnType<typeof evaluateWinningTopics>,
  patterns: GrowthPattern[],
  now: Date
): { strategy: ContentGrowthStrategy; applied: AppliedStrategyChange[]; skipped: string[] } {
  const strategy: ContentGrowthStrategy = JSON.parse(JSON.stringify(before));
  const applied: AppliedStrategyChange[] = [];
  const skipped: string[] = [];
  if (confidence === "low") return { strategy, applied, skipped: ["投稿サンプルが3件未満のため自動変更なし"] };

  const purposeScores = new Map<keyof PurposeMix, number[]>();
  const purposeKey = (purpose: string): keyof PurposeMix => purpose === "reach" ? "reach" : purpose === "note-bridge" ? "noteBridge" : "monetize";
  for (const record of records.filter((item) => item.platform === "x")) {
    const key = purposeKey(record.purpose);
    purposeScores.set(key, [...(purposeScores.get(key) ?? []), contentPerformanceScore(record, weights)]);
  }
  const ranked = [...purposeScores.entries()].filter(([, scores]) => scores.length >= 2)
    .map(([key, scores]) => ({ key, score: scores.reduce((a, b) => a + b, 0) / scores.length }))
    .sort((a, b) => b.score - a.score);
  if (ranked.length >= 2 && ranked[0].score > ranked[ranked.length - 1].score * 1.1) {
    const best = ranked[0].key;
    const worst = ranked[ranked.length - 1].key;
    const amount = Math.min(5, PURPOSE_BOUNDS[best][1] - strategy.purposeMix[best], strategy.purposeMix[worst] - PURPOSE_BOUNDS[worst][0]);
    if (amount > 0) {
      const old = { ...strategy.purposeMix };
      strategy.purposeMix[best] = clamp(strategy.purposeMix[best] + amount, PURPOSE_BOUNDS[best]);
      strategy.purposeMix[worst] = clamp(strategy.purposeMix[worst] - amount, PURPOSE_BOUNDS[worst]);
      applied.push({ field: "purposeMix", before: old, after: { ...strategy.purposeMix }, reason: `過去7日Performanceで${best}が${worst}を10%以上上回ったため（1晩${amount}pt）` });
    }
  } else skipped.push("Purpose別の差または最低サンプルが不足");

  const assignPriority = <K extends "topicPriority" | "genrePriority" | "patternPriority">(field: K, value: ContentGrowthStrategy[K], reason: string) => {
    if (JSON.stringify(strategy[field]) !== JSON.stringify(value)) {
      applied.push({ field, before: strategy[field], after: value, reason });
      strategy[field] = value;
    }
  };
  assignPriority("topicPriority", winningTopics.filter((topic) => topic.winning).slice(0, 5).map((topic) => topic.topicId), "28日窓のWinning Topicを翌日のexploitation候補へ反映");
  assignPriority("genrePriority", [...new Set(winningTopics.filter((topic) => topic.winning).map((topic) => topic.genreId))].slice(0, 3), "Winning TopicのGenre順位を反映");
  assignPriority("patternPriority", patterns.filter((pattern) => pattern.winning && pattern.pattern !== "unknown-pattern").slice(0, 3).map((pattern) => pattern.pattern as ContentGrowthStrategy["patternPriority"][number]), "最低3サンプルを満たすWinning Patternを反映");
  const boundedExploration = clamp(strategy.explorationRate, [15, 30]);
  if (boundedExploration !== strategy.explorationRate) {
    applied.push({ field: "explorationRate", before: strategy.explorationRate, after: boundedExploration, reason: "探索枠を15〜30%に維持" });
    strategy.explorationRate = boundedExploration;
  }
  strategy.updatedAt = now.toISOString();
  return { strategy, applied, skipped };
}

export function rollbackStrategy(review: DailyGrowthReview): ContentGrowthStrategy {
  return JSON.parse(JSON.stringify(review.strategyBefore));
}

export function buildDailyGrowthReview(input: {
  records: ContentPerformance[];
  strategy: ContentGrowthStrategy;
  weights: PerformanceWeights;
  winningTopicPolicy: WinningTopicPolicy;
  now?: Date;
  noteFreshness?: "fresh" | "stale" | "unavailable";
  xFreshness?: "fresh" | "partial";
  experiments?: string[];
  noteApprovalPriorities?: DailyGrowthReview["noteApprovalPriorities"];
}): DailyGrowthReview {
  const now = input.now ?? new Date();
  const last7 = inWindow(input.records, now, 7);
  const previous7 = inWindow(input.records, now, 14, 7);
  const last28 = inWindow(input.records, now, 28);
  const yesterday = inWindow(input.records, now, 1);
  const x7 = last7.filter((record) => record.platform === "x");
  const confidence = growthConfidence(x7.length);
  const topics = evaluateWinningTopics(last28, input.weights, input.winningTopicPolicy);
  const patterns = aggregateGrowthPatterns(last28, input.weights);
  const updated = improveStrategy(input.strategy, last7, input.weights, confidence, topics, patterns, now);
  const funnel = buildFunnel(last28);
  const note = summarizeNote(yesterday);
  const paid = sumObserved(last28, (record) => record.paidPurchases ?? record.noteSales);
  const freeViews = sumObserved(last28, (record) => record.freeNoteViews);
  return {
    date: new Date(now.getTime() + 9 * 3_600_000).toISOString().slice(0, 10),
    measuredThrough: now.toISOString(),
    dataFreshness: { x: input.xFreshness ?? (x7.some((record) => record.metricsStale) ? "partial" : "fresh"), note: input.noteFreshness ?? "unavailable" },
    xSummary: summarizeX(yesterday), noteSummary: note,
    comparisons: {
      yesterday: summarizeX(yesterday), last7Days: summarizeX(last7), previous7Days: summarizeX(previous7), last28Days: summarizeX(last28),
      movingAverage7d: summarizeX(last7).impressions === undefined ? undefined : summarizeX(last7).impressions! / 7,
      movingAverage28d: summarizeX(last28).impressions === undefined ? undefined : summarizeX(last28).impressions! / 28,
    },
    funnel,
    winningTopics: topics.filter((topic) => topic.winning),
    decliningTopics: topics.filter((topic) => !topic.winning && topic.postCount >= input.winningTopicPolicy.minimumPosts).slice(-5),
    winningPatterns: patterns.filter((pattern) => pattern.winning).slice(0, 10),
    losingPatterns: patterns.filter((pattern) => pattern.sampleSize >= 3 && !pattern.winning).slice(-10),
    bestPurposes: [...new Set(patterns.filter((pattern) => pattern.winning).map((pattern) => pattern.purpose))].slice(0, 3),
    bestPostingSlots: [...new Set(patterns.filter((pattern) => pattern.winning).map((pattern) => pattern.postingSlot))].slice(0, 3),
    monetizationSummary: { revenue: sumObserved(last28, (record) => record.noteRevenue), paidPurchases: paid, freeToPaidConversion: paid === undefined || freeViews === undefined || freeViews <= 0 ? undefined : paid / freeViews },
    bottleneck: summarizeX(last28).impressions === undefined
      ? "Metrics unavailable: impressions取得後にファネル判定"
      : diagnoseFunnel(funnel),
    insights: [
      confidence === "low" ? "サンプル不足のため戦略は維持" : `${x7.length}投稿を7日窓で評価`,
      summarizeX(last7).followersGained === undefined ? "Follower data: Unavailable（engagement/link clicksをproxy表示）" : "Follower data: Available",
    ],
    experiments: (input.experiments ?? []).slice(0, 3),
    strategyBefore: JSON.parse(JSON.stringify(input.strategy)), strategyAfter: updated.strategy,
    appliedChanges: updated.applied, skippedChanges: updated.skipped,
    confidence,
    noteApprovalPriorities: (input.noteApprovalPriorities ?? []).slice(0, 3),
  };
}
