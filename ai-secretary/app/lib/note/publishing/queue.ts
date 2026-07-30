/**
 * 投稿キューの排他制御・二重投稿防止・上限管理。
 *
 * Slackのボタンは二度押されうるし、cronは重複起動しうる。
 * Redisがある場合はそれで確実に守り、無い場合もプロセス内で最低限守る。
 */

import { getRedisClient } from "../../utils/redis";

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

/* ─── ロック ───────────────────────────── */

const LOCK_TTL_SEC = 120;

/** 同時実行を防ぐ。取得できたら true */
export async function acquireLock(name: string): Promise<boolean> {
  const fullKey = `${KEY_PREFIX}:lock:${name}`;
  const redis = getRedisClient();

  if (redis) {
    try {
      const result = await redis.set(fullKey, Date.now(), { nx: true, ex: LOCK_TTL_SEC });
      return result === "OK";
    } catch (error) {
      console.warn("[publish/queue] lock failed, falling back:", error);
    }
  }

  sweepLocal(localLocks, LOCK_TTL_SEC * 1000);
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
export async function withLock<T>(name: string, fn: () => Promise<T>): Promise<T | null> {
  if (!(await acquireLock(name))) return null;
  try {
    return await fn();
  } finally {
    await releaseLock(name);
  }
}

/* ─── 1日の投稿上限 ───────────────────── */

function todayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

/** 今日すでに何件投稿したか */
export async function countToday(platform: "x" | "note"): Promise<number> {
  const key = `${KEY_PREFIX}:count:${platform}:${todayKey()}`;
  const redis = getRedisClient();
  if (redis) {
    try {
      return Number((await redis.get<number>(key)) ?? 0);
    } catch {
      return 0;
    }
  }
  return Number(localSeen.get(key) ?? 0);
}

export async function incrementToday(platform: "x" | "note"): Promise<void> {
  const key = `${KEY_PREFIX}:count:${platform}:${todayKey()}`;
  const redis = getRedisClient();
  if (redis) {
    try {
      await redis.incr(key);
      await redis.expire(key, 48 * 60 * 60);
      return;
    } catch {
      // フォールバックへ
    }
  }
  localSeen.set(key, Number(localSeen.get(key) ?? 0) + 1);
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
