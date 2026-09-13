import type { Redis } from "@upstash/redis";
import { getRedisClient } from "../../utils/redis";
import type { CanaryResult } from "../execution/runnerTypes";
import { runtimeEnvironment } from "./environment";
import { StoreUnavailableError } from "./runtimeTypes";

type CanaryRedis = Pick<Redis, "lpush" | "lrange" | "ltrim" | "set">;

export class CanaryResultStore {
  private readonly key: string;

  constructor(private readonly redis: CanaryRedis = requireRedis()) {
    this.key = runtimeEnvironment().redisNamespace + ":canary:execution:v1:results";
  }

  async save(result: CanaryResult) {
    try {
      await this.redis.lpush(this.key, JSON.stringify(result));
      await this.redis.ltrim(this.key, 0, 29);
    } catch {
      throw new StoreUnavailableError("CANARY_STORE_ERROR");
    }
  }

  async recent(limit = 30): Promise<CanaryResult[]> {
    try {
      const rows = await this.redis.lrange<string>(this.key, 0, Math.max(0, limit - 1));
      return rows.map((row) => typeof row === "string" ? JSON.parse(row) as CanaryResult : row as CanaryResult);
    } catch {
      throw new StoreUnavailableError("CANARY_STORE_ERROR");
    }
  }

  async claim(period: string) {
    try {
      return (await this.redis.set(this.key + ":run:" + period, "PROCESSING", { nx: true, ex: 172800 })) === "OK";
    } catch {
      throw new StoreUnavailableError("CANARY_STORE_ERROR");
    }
  }
}

function requireRedis(): CanaryRedis {
  const redis = getRedisClient();
  if (!redis) throw new StoreUnavailableError("UPSTASH_REDIS_REQUIRED");
  return redis;
}
