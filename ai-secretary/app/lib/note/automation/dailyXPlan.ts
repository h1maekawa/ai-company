import { createHash } from "node:crypto";
import { PURPOSE_BOUNDS } from "../growthLoop";
import { DEFAULT_X_SCHEDULE, scheduledAtInTokyo, weekKeyTokyo } from "../operations";
import { tokyoDayStartMs } from "../tokyoDate";
import type {
  ContentGrowthStrategy,
  ContentPurpose,
  DailyXPlan,
  DailyXPlanSlot,
  PurposeBucket,
  PurposeMix,
  TrendCluster,
} from "../research/types";

/**
 * Daily X Plan（純関数）。同じ入力なら完全に同じPlanを返す（Math.random / 現在時刻に依存しない）。
 * 当日Planは一度保存したら再計算しない。retryで変わるのは slot の status だけ。
 */

export const EXPLORATION_BOUNDS: [number, number] = [15, 30];
const BUCKET_ORDER: PurposeBucket[] = ["reach", "noteBridge", "monetize"];
const clamp = (value: number, [min, max]: [number, number]) => Math.min(max, Math.max(min, value));

export function dailyXPlanId(date: string, accountKey: string): string {
  return `daily-x:${date}:${accountKey}`;
}

export function dailyXSlotId(date: string, accountKey: string, slotIndex: number): string {
  return `${dailyXPlanId(date, accountKey)}:${slotIndex}`;
}

/** PURPOSE_BOUNDS でclampし、合計100へ正規化する */
export function normalizePurposeMix(mix: PurposeMix): PurposeMix {
  const clamped = {
    reach: clamp(Number(mix.reach) || 0, PURPOSE_BOUNDS.reach),
    noteBridge: clamp(Number(mix.noteBridge) || 0, PURPOSE_BOUNDS.noteBridge),
    monetize: clamp(Number(mix.monetize) || 0, PURPOSE_BOUNDS.monetize),
  };
  const total = clamped.reach + clamped.noteBridge + clamped.monetize;
  return {
    reach: (clamped.reach / total) * 100,
    noteBridge: (clamped.noteBridge / total) * 100,
    monetize: (clamped.monetize / total) * 100,
  };
}

/**
 * 週次クォータ（S10）。長さ 7 * slotsPerDay、位置 = dayIndex * slotsPerDay + slotIndex。
 * 1) clamp + 正規化 2) 最大剰余法で週quota 3) 均等分散（stride）で並べる。同点は reach > noteBridge > monetize。
 * 過去実績に依存しない決定的な配列。
 */
export function allocateWeeklyPurposes(input: { purposeMix: PurposeMix; slotsPerDay: number }): PurposeBucket[] {
  const total = 7 * Math.max(0, Math.floor(input.slotsPerDay));
  if (total === 0) return [];
  const mix = normalizePurposeMix(input.purposeMix);
  const exact = BUCKET_ORDER.map((bucket) => ({ bucket, value: (mix[bucket] / 100) * total }));
  const quota = new Map(exact.map(({ bucket, value }) => [bucket, Math.floor(value)]));
  let remaining = total - [...quota.values()].reduce((a, b) => a + b, 0);
  for (const { bucket } of [...exact].sort((a, b) => (b.value - Math.floor(b.value)) - (a.value - Math.floor(a.value)) || BUCKET_ORDER.indexOf(a.bucket) - BUCKET_ORDER.indexOf(b.bucket))) {
    if (remaining <= 0) break;
    quota.set(bucket, quota.get(bucket)! + 1);
    remaining--;
  }
  const assigned = new Map<PurposeBucket, number>(BUCKET_ORDER.map((bucket) => [bucket, 0]));
  const result: PurposeBucket[] = [];
  for (let position = 0; position < total; position++) {
    let best: PurposeBucket = BUCKET_ORDER[0];
    let bestScore = -Infinity;
    for (const bucket of BUCKET_ORDER) {
      const score = (quota.get(bucket)! * (position + 1)) / total - assigned.get(bucket)!;
      if (score > bestScore + 1e-9) { best = bucket; bestScore = score; }
    }
    result.push(best);
    assigned.set(best, assigned.get(best)! + 1);
  }
  return result;
}

/** sha256(key) の先頭4byteを uint32 として % 100 */
export function stableBucket(key: string): number {
  return createHash("sha256").update(key).digest().readUInt32BE(0) % 100;
}

export function isExplorationSlot(slotId: string, explorationRate: number): boolean {
  return stableBucket(slotId) < explorationRate;
}

/** Tokyo週（月曜起点、weekKeyTokyo と同じ定義）の何日目か */
export function tokyoDayIndexInWeek(date: string): number {
  const start = tokyoDayStartMs(date);
  const monday = tokyoDayStartMs(weekKeyTokyo(new Date(start)));
  return Math.round((start - monday) / 86_400_000);
}

/** bucket → purpose。reach bucket は その日の1件目 reach、2件目 trust、3件目以降 reach。monetize は x-monetization のみ */
export function purposesForDay(buckets: PurposeBucket[]): ContentPurpose[] {
  let reachSeen = 0;
  return buckets.map((bucket) => {
    if (bucket === "noteBridge") return "note-bridge";
    if (bucket === "monetize") return "x-monetization";
    reachSeen++;
    return reachSeen === 2 ? "trust" : "reach";
  });
}

const hot = (cluster: TrendCluster) => cluster.hotScore ?? cluster.totalScore;

/** exploitation順: 既存の topicPriority / genrePriority 優先ソート（同順位はhotScore） */
export function exploitationOrder(candidates: TrendCluster[], strategy: Pick<ContentGrowthStrategy, "topicPriority" | "genrePriority">): TrendCluster[] {
  const priority = (candidate: TrendCluster) => {
    const topic = strategy.topicPriority.indexOf(candidate.id);
    const genre = Math.min(...candidate.genreIds.map((id) => {
      const index = strategy.genrePriority.indexOf(id);
      return index < 0 ? 99 : index;
    }), 99);
    return (topic < 0 ? 99 : topic) * 100 + genre;
  };
  return [...candidates].sort((left, right) => priority(left) - priority(right) || hot(right) - hot(left) || left.id.localeCompare(right.id));
}

/** exploration順: 既存の hotScore 順 */
export function explorationOrder(candidates: TrendCluster[]): TrendCluster[] {
  return [...candidates].sort((left, right) => hot(right) - hot(left) || left.id.localeCompare(right.id));
}

export function buildDailyXPlan(input: {
  date: string;
  accountKey: string;
  now: Date;
  strategy: ContentGrowthStrategy;
  maxXPostsPerDay: number;
  /** status=candidate, !blocked, filterHotConfidenceCandidates 済み */
  candidates: TrendCluster[];
}): DailyXPlan | null {
  if (input.candidates.length === 0) return null;
  const slotsPerDay = Math.min(Math.max(0, Math.floor(input.maxXPostsPerDay)), DEFAULT_X_SCHEDULE.length);
  if (slotsPerDay === 0) return null;

  const purposeMix = normalizePurposeMix(input.strategy.purposeMix);
  const explorationRate = clamp(input.strategy.explorationRate, EXPLORATION_BOUNDS);
  const weekly = allocateWeeklyPurposes({ purposeMix, slotsPerDay });
  const dayIndex = tokyoDayIndexInWeek(input.date);
  const buckets = weekly.slice(dayIndex * slotsPerDay, (dayIndex + 1) * slotsPerDay);
  const purposes = purposesForDay(buckets);
  const exploitation = exploitationOrder(input.candidates, input.strategy);
  const exploration = explorationOrder(input.candidates);
  const assigned = new Set<string>();
  const dayStart = new Date(tokyoDayStartMs(input.date));
  const timestamp = input.now.toISOString();

  const slots: DailyXPlanSlot[] = buckets.map((bucket, slotIndex) => {
    const id = dailyXSlotId(input.date, input.accountKey, slotIndex);
    const explore = isExplorationSlot(id, explorationRate);
    const order = explore ? exploration : exploitation;
    const candidate = order.find((cluster) => !assigned.has(cluster.id)) ?? order[0];
    assigned.add(candidate.id);
    const time = DEFAULT_X_SCHEDULE[slotIndex].time;
    return {
      id,
      slotIndex,
      purpose: purposes[slotIndex],
      bucket,
      scheduledTime: time,
      scheduledAt: scheduledAtInTokyo(dayStart, time),
      timeSource: "default",
      exploration: explore,
      candidateRef: { kind: "cluster", id: candidate.id },
      status: "planned",
      updatedAt: timestamp,
    };
  });

  return {
    id: dailyXPlanId(input.date, input.accountKey),
    date: input.date,
    accountKey: input.accountKey,
    strategySnapshot: {
      purposeMix,
      explorationRate,
      topicPriority: [...input.strategy.topicPriority],
      genrePriority: [...input.strategy.genrePriority],
      patternPriority: [...input.strategy.patternPriority],
      maxXPostsPerDay: input.maxXPostsPerDay,
      ...(input.strategy.updatedAt ? { strategyUpdatedAt: input.strategy.updatedAt } : {}),
    },
    slots,
    generatedAt: timestamp,
    updatedAt: timestamp,
  };
}
