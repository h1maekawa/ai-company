/**
 * redis.ts — Upstash Redis client (fail-open)
 *
 * Returns null if UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN are not set,
 * so all callers can safely fall back to file persistence without throwing.
 */

import { Redis } from "@upstash/redis";

// --- Availability check ---
export const isRedisAvailable = Boolean(
  process.env.UPSTASH_REDIS_REST_URL &&
  process.env.UPSTASH_REDIS_REST_TOKEN
);

// --- Client singleton ---
let _redis: Redis | null = null;

export function getRedisClient(): Redis | null {
  if (!isRedisAvailable) return null;
  if (!_redis) {
    _redis = new Redis({
      url: process.env.UPSTASH_REDIS_REST_URL!,
      token: process.env.UPSTASH_REDIS_REST_TOKEN!,
    });
  }
  return _redis;
}

// --- Namespace helpers ---
export const REDIS_KEYS = {
  companyInbox:    "bus:company:inbox",
  companyPipeline: "bus:company:pipeline",
  personalInbox:   "bus:personal:inbox",
  personalPipeline:"bus:personal:pipeline",
} as const;

/**
 * Safe Redis GET — returns null on any failure (fail-open)
 */
export async function redisSafeGet<T>(key: string): Promise<T | null> {
  const client = getRedisClient();
  if (!client) return null;
  try {
    return await client.get<T>(key);
  } catch (err) {
    console.warn(`[redis] GET failed for ${key}`, err);
    return null;
  }
}

/**
 * Safe Redis SET — silently ignores failures (fail-open)
 */
export async function redisSafeSet(key: string, value: unknown): Promise<void> {
  const client = getRedisClient();
  if (!client) return;
  try {
    await client.set(key, value);
  } catch (err) {
    console.warn(`[redis] SET failed for ${key}`, err);
    // do NOT rethrow — fail-open
  }
}
