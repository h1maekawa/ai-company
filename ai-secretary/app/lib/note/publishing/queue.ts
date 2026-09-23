/**
 * 投稿キューの排他制御・二重投稿防止・上限管理。
 *
 * Slackのボタンは二度押されうるし、cronは重複起動しうる。
 * Redisがある場合はそれで確実に守り、無い場合もプロセス内で最低限守る。
 */

import { getRedisClient } from "../../utils/redis";
import { tokyoDateKey } from "../tokyoDate";

const KEY_PREFIX = "note:publish";

/** Redisが無い環境用のフォールバック（単一プロセス内でのみ有効） */
const localSeen = new Map<string, number>();
const localLocks = new Map<string, number>();

function sweepLocal(store: Map<string, number>, ttlMs: number) {
  const now = Date.now();
  for (const [key, at] of store) if (now - at > ttlMs) store.delete(key);
}

/* ─── idempotency ───────────────────────── */

const IDEMPOTENCY_TTL_SEC = 24 * 60 * 60;

/**
 * 同じ操作が既に実行済みかを調べ、未実行なら「実行済み」として記録する。
 * true が返ったら実行してよい。false は二重実行なので何もしない。
 */
export async function claimOnce(key: string): Promise<boolean> {
  const fullKey = `${KEY_PREFIX}:once:${key}`;
  const redis = getRedisClient();

  if (redis) {
    try {
      // NX: 既に存在すれば失敗する＝先に誰かが取っている
      const result = await redis.set(fullKey, Date.now(), { nx: true, ex: IDEMPOTENCY_TTL_SEC });
      return result === "OK";
    } catch (error) {
      console.warn("[publish/queue] idempotency check failed, falling back:", error);
    }
  }

  sweepLocal(localSeen, IDEMPOTENCY_TTL_SEC * 1000);
  if (localSeen.has(fullKey)) return false;
  localSeen.set(fullKey, Date.now());
  return true;
}

/* ─── 厳格なclaim（Autopilot予約経路専用） ───────────── */

export type ClaimResult = "claimed" | "duplicate" | "unavailable";
const CLAIM_TTL_SEC = 48 * 60 * 60;

/**
 * Redisのみで判定する。プロセス内fallbackは使わない（fail-closed）。
 * Redis未設定・通信失敗は "unavailable" を返し、呼び出し側は予約しない。
 * 既存 claimOnce（Slack等）は変更しない。
 */
export async function claimStrict(key: string, ttlSec = CLAIM_TTL_SEC): Promise<ClaimResult> {
  const redis = getRedisClient();
  if (!redis) return "unavailable";
  try {
    const result = await redis.set(`${KEY_PREFIX}:claim:${key}`, Date.now(), { nx: true, ex: ttlSec });
    return result === "OK" ? "claimed" : "duplicate";
  } catch (error) {
    console.warn("[publish/queue] strict claim unavailable:", error);
    return "unavailable";
  }
}

/** Bufferが明示的に拒否した（未送信が確定した）ときだけ呼ぶ。結果不明のときは呼ばない */
export async function releaseClaim(key: string): Promise<void> {
  const redis = getRedisClient();
  if (!redis) return;
  try {
    await redis.del(`${KEY_PREFIX}:claim:${key}`);
  } catch (error) {
    console.warn("[publish/queue] claim release failed:", error);
  }
}

/* ─── ロック ───────────────────────────── */

const DEFAULT_LOCK_TTL_SEC = 120;

/** 同時実行を防ぐ。取得できたら true。ttlSec は処理の最大時間より長くする */
export async function acquireLock(name: string, ttlSec = DEFAULT_LOCK_TTL_SEC): Promise<boolean> {
  const fullKey = `${KEY_PREFIX}:lock:${name}`;
  const redis = getRedisClient();

  if (redis) {
    try {
      const result = await redis.set(fullKey, Date.now(), { nx: true, ex: ttlSec });
      return result === "OK";
    } catch (error) {
      console.warn("[publish/queue] lock failed, falling back:", error);
    }
  }

  sweepLocal(localLocks, ttlSec * 1000);
  if (localLocks.has(fullKey)) return false;
  localLocks.set(fullKey, Date.now());
  return true;
}

export async function releaseLock(name: string): Promise<void> {
  const fullKey = `${KEY_PREFIX}:lock:${name}`;
  const redis = getRedisClient();
  if (redis) {
    try {
      await redis.del(fullKey);
      return;
    } catch {
      // フォールバックへ
    }
  }
  localLocks.delete(fullKey);
}

/** ロックを取ってから処理する。取れなければ null を返す */
export async function withLock<T>(
  name: string,
  fn: () => Promise<T>,
  options?: { ttlSec?: number }
): Promise<T | null> {
  if (!(await acquireLock(name, options?.ttlSec))) return null;
  try {
    return await fn();
  } finally {
    await releaseLock(name);
  }
}

/* ─── 1日の投稿上限（Asia/Tokyoの投稿予定日で数える） ───────────────────── */

const countKey = (platform: "x" | "note", dateKey: string) => `${KEY_PREFIX}:count:${platform}:${dateKey}`;

/**
 * 指定Tokyo日付に何件予約・投稿したか。
 * strict: true のとき、Redis未設定・失敗は "unavailable"（0扱いしない）。
 */
export async function countForTokyoDate(
  platform: "x" | "note",
  dateKey: string,
  options?: { strict?: boolean }
): Promise<number | "unavailable"> {
  const key = countKey(platform, dateKey);
  const redis = getRedisClient();
  if (redis) {
    try {
      return Number((await redis.get<number>(key)) ?? 0);
    } catch {
      if (options?.strict) return "unavailable";
      return 0;
    }
  }
  if (options?.strict) return "unavailable";
  return Number(localSeen.get(key) ?? 0);
}

export async function incrementForTokyoDate(platform: "x" | "note", dateKey: string): Promise<void> {
  const key = countKey(platform, dateKey);
  const redis = getRedisClient();
  if (redis) {
    try {
      await redis.incr(key);
      await redis.expire(key, 48 * 60 * 60);
      return;
    } catch (error) {
      // strict経路（Autopilot）は呼び出し側で永続化失敗として扱えるよう例外を伝える
      console.warn("[publish/queue] count increment failed:", error);
      throw error;
    }
  }
  localSeen.set(key, Number(localSeen.get(key) ?? 0) + 1);
}

/** 今日（Asia/Tokyo）すでに何件投稿したか */
export async function countToday(platform: "x" | "note"): Promise<number> {
  const count = await countForTokyoDate(platform, tokyoDateKey());
  return count === "unavailable" ? 0 : count;
}

export async function incrementToday(platform: "x" | "note"): Promise<void> {
  try {
    await incrementForTokyoDate(platform, tokyoDateKey());
  } catch {
    // 既存呼び出し元（Slack・手動Buffer）の挙動を維持: 失敗しても処理は続ける
    const key = countKey(platform, tokyoDateKey());
    localSeen.set(key, Number(localSeen.get(key) ?? 0) + 1);
  }
}

/** 上限に達していないか */
export async function canPublishToday(
  platform: "x" | "note",
  max: number
): Promise<{ allowed: boolean; used: number }> {
  const used = await countToday(platform);
  return { allowed: used < max, used };
}

/* ─── アフィリエイト連投防止 ───────────── */

/**
 * 直近の投稿で同じアフィリエイトを使いすぎていないか。
 * recentAffiliateIds は新しい順。
 */
export function affiliateCooldownOk(
  affiliateId: string,
  recentAffiliateIds: (string | undefined)[],
  cooldown: number
): boolean {
  return !recentAffiliateIds.slice(0, cooldown).includes(affiliateId);
}
