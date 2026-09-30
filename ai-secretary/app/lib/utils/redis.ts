/**
 * redis.ts — Upstash Redis client and cache-safe helpers
 *
 * Critical state callers must reject null and transport errors. Only cache
 * callers should use the fail-open redisSafeGet/redisSafeSet helpers.
 */

import { Redis } from "@upstash/redis";
import { runtimeEnvironment } from "../company/runtime/environment";

// --- Availability check ---
const stage = runtimeEnvironment().stage;
// Preview/development must have their own credentials. An inherited production
// URL/token pair is deliberately ignored; direct Redis callers also stay isolated.
const redisUrl = stage === "production" ? process.env.UPSTASH_REDIS_REST_URL : stage === "preview" ? process.env.UPSTASH_REDIS_REST_URL_PREVIEW : process.env.UPSTASH_REDIS_REST_URL_DEVELOPMENT;
const redisToken = stage === "production" ? process.env.UPSTASH_REDIS_REST_TOKEN : stage === "preview" ? process.env.UPSTASH_REDIS_REST_TOKEN_PREVIEW : process.env.UPSTASH_REDIS_REST_TOKEN_DEVELOPMENT;
export const isRedisAvailable = Boolean(redisUrl && redisToken);

// --- Client singleton ---
let _redis: Redis | null = null;

export function getRedisClient(): Redis | null {
  if (!isRedisAvailable) return null;
  if (!_redis) {
    _redis = new Redis({
      url: redisUrl!,
      token: redisToken!,
    });
  }
  return _redis;
}

// --- Namespace helpers ---
const busPrefix = runtimeEnvironment().stage === "production" ? "" : `${runtimeEnvironment().redisNamespace}:`;
export const REDIS_KEYS = {
  companyInbox:    `${busPrefix}bus:company:inbox`,
  companyPipeline: `${busPrefix}bus:company:pipeline`,
  personalInbox:   `${busPrefix}bus:personal:inbox`,
  personalPipeline:`${busPrefix}bus:personal:pipeline`,
  version: `${busPrefix}bus:version`,
  snapshot: `${busPrefix}bus:snapshot`,
} as const;

/** Grilling Session（docs/15 D3）。本番ではRedisがSession Stateの唯一の永続実体。 */
export const GRILL_KEYS = {
  session: (id: string) => `${busPrefix}grill:session:${id}`,
  activeIndex: `${busPrefix}grill:index:active`,
} as const;

/**
 * Redis SET の成否を返す版（fail-openだが結果は握りつぶさない）。
 * Grilling は「保存できたか」をUIへ伝える必要があるため、成否が必要（sessionDurability）。
 */
export async function redisTrySet(key: string, value: unknown): Promise<boolean> {
  const client = getRedisClient();
  if (!client) return false;
  try {
    await client.set(key, value);
    return true;
  } catch (err) {
    console.warn(`[redis] SET failed for ${key}`, err);
    return false;
  }
}

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
