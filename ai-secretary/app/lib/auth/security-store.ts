import { getRedisClient } from "@/app/lib/utils/redis";

const local = new Map<string, { value: string; expires: number }>();
const isLocal = process.env.NODE_ENV === "test" || (process.env.NODE_ENV === "development" && !process.env.VERCEL_ENV);

function scopedKey(key: string): string {
  const environment = process.env.VERCEL_ENV || process.env.NODE_ENV || "unknown";
  const deployment = process.env.VERCEL_GIT_COMMIT_REF || "default";
  return `auth:${environment}:${deployment}:${key}`;
}

export async function recordLoginAttempt(identity: string): Promise<{ count: number; retryAfter: number }> {
  const key = scopedKey(`login:${identity}`);
  if (isLocal) {
    const now = Date.now();
    const prior = local.get(key);
    const next = prior && prior.expires > now ? { value: String(Number(prior.value) + 1), expires: prior.expires } : { value: "1", expires: now + 15 * 60_000 };
    local.set(key, next);
    if (local.size > 2000) for (const [name, entry] of local) if (entry.expires <= now) local.delete(name);
    return { count: Number(next.value), retryAfter: Math.max(1, Math.ceil((next.expires - now) / 1000)) };
  }
  const redis = getRedisClient();
  if (!redis) throw new Error("AUTH_STORE_UNAVAILABLE");
  const result = await redis.eval(
    "local n=redis.call('INCR',KEYS[1]); if n==1 then redis.call('EXPIRE',KEYS[1],ARGV[1]); end; return {n,redis.call('TTL',KEYS[1])}",
    [key], [900]
  ) as [number, number];
  return { count: Number(result[0]), retryAfter: Math.max(1, Number(result[1])) };
}

export async function revokeSession(tokenId: string, ttlSeconds: number): Promise<void> {
  const key = scopedKey(`revoked:${tokenId}`);
  if (isLocal) { local.set(key, { value: "1", expires: Date.now() + ttlSeconds * 1000 }); return; }
  const redis = getRedisClient();
  if (!redis) throw new Error("AUTH_STORE_UNAVAILABLE");
  await redis.set(key, "1", { ex: ttlSeconds });
}

export async function isSessionRevoked(tokenId: string): Promise<boolean> {
  const key = scopedKey(`revoked:${tokenId}`);
  if (isLocal) { const item = local.get(key); return Boolean(item && item.expires > Date.now()); }
  const redis = getRedisClient();
  if (!redis) throw new Error("AUTH_STORE_UNAVAILABLE");
  return (await redis.get(key)) !== null;
}
