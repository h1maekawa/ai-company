import { getRedisClient } from "../../utils/redis";
import { tokyoDateKey } from "../tokyoDate";
import type { ResearchRunResult } from "./run";

export type DailyJobResult = Pick<ResearchRunResult, "fetched" | "newItems" | "topCandidates" | "failures" | "xSkippedReason" | "estimatedCostUsd" | "ranAt">;
export type DailyCheckpoint = {
  operationId: string;
  phase: "ready" | "collecting" | "collected" | "notifying" | "completed" | "needs_review";
  result?: DailyJobResult;
  updatedAt: string;
  reason?: string;
};

const PREFIX = "note:daily-research:v1";
const TTL_SECONDS = 8 * 24 * 60 * 60;
export const dailyOperationId = () => `${PREFIX}:${tokyoDateKey()}`;

export async function resolveDailyOperationId(): Promise<string> {
  const redis = getRedisClient();
  if (!redis) throw new Error("Daily research requires durable Redis");
  const active = await redis.get<string>(`${PREFIX}:active`);
  if (active?.startsWith(`${PREFIX}:`)) {
    const saved = await loadDailyCheckpoint(active);
    if (saved && saved.phase !== "completed") return active;
  }
  return dailyOperationId();
}

export function dailyResearchPolicy(env: NodeJS.ProcessEnv = process.env) {
  const bounded = (value: string | undefined, fallback: number, max: number) => {
    const parsed = Number(value);
    return Number.isInteger(parsed) && parsed > 0 ? Math.min(parsed, max) : fallback;
  };
  return {
    paused: env.NOTE_RESEARCH_PAUSED === "true",
    maxCandidates: bounded(env.NOTE_RESEARCH_MAX_CANDIDATES, 5, 20),
    maxDurationMs: bounded(env.NOTE_RESEARCH_MAX_DURATION_MS, 240_000, 290_000),
  };
}

export async function loadDailyCheckpoint(operationId: string): Promise<DailyCheckpoint | null> {
  const redis = getRedisClient();
  if (!redis) throw new Error("Daily research requires durable Redis");
  return redis.get<DailyCheckpoint>(`${operationId}:checkpoint`);
}

export async function saveDailyCheckpoint(checkpoint: DailyCheckpoint): Promise<void> {
  const redis = getRedisClient();
  if (!redis) throw new Error("Daily research requires durable Redis");
  await redis.multi()
    .set(`${checkpoint.operationId}:checkpoint`, checkpoint, { ex: TTL_SECONDS })
    .set(`${PREFIX}:active`, checkpoint.operationId, { ex: TTL_SECONDS })
    .exec();
}

/** A single active tick; stale locks expire after the request's maximum runtime. */
export async function withDailyJobLock<T>(operationId: string, work: () => Promise<T>): Promise<T | null> {
  const redis = getRedisClient();
  if (!redis) throw new Error("Daily research requires durable Redis");
  const lockKey = `${operationId}:lock`;
  const token = crypto.randomUUID();
  if (await redis.set(lockKey, token, { nx: true, ex: 360 }) !== "OK") return null;
  try { return await work(); }
  finally {
    // A lock which expired and was replaced by another worker must not be deleted.
    if (await redis.get<string>(lockKey) === token) await redis.del(lockKey);
  }
}

export function checkpoint(operationId: string, phase: DailyCheckpoint["phase"], result?: DailyJobResult, reason?: string): DailyCheckpoint {
  return { operationId, phase, result, reason, updatedAt: new Date().toISOString() };
}
