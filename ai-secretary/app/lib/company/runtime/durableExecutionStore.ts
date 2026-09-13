import type { Redis } from "@upstash/redis";
import { getRedisClient } from "../../utils/redis";
import type { ExecutionMission } from "../execution/mission";
import type { ExecutionState } from "../execution/store";
import { assertAppendOnly, normalizeExecutionState } from "./stateCodec";
import type { ExecutionEvent, ExecutionSnapshot, ExecutionStore, LeaseGuard, MissionLease } from "./runtimeTypes";
import { ExecutionConflictError, FencingTokenError, StoreUnavailableError } from "./runtimeTypes";

type RuntimeRedis = Pick<Redis, "get" | "set" | "eval" | "lpush" | "lrange" | "ltrim">;
const KEY = "company:execution:v8:snapshot";
const VERSION = "company:execution:v8:version";
const EVENTS = "company:execution:v8:events";
const leaseKey = (missionId: string) => `company:execution:v8:lease:${missionId}`;
const fenceKey = (missionId: string) => `company:execution:v8:fence:${missionId}`;
const idemKey = (scope: string, key: string) => `company:execution:v8:idem:${scope}:${key}`;

const SAVE_SCRIPT = `
local current = tonumber(redis.call('GET', KEYS[2]) or '0')
if current ~= tonumber(ARGV[1]) then return {0, current} end
if KEYS[3] ~= '' then
  if redis.call('HGET', KEYS[3], 'holderId') ~= ARGV[3] then return {-1, current} end
  if tonumber(redis.call('HGET', KEYS[3], 'fencingToken') or '-1') ~= tonumber(ARGV[4]) then return {-1, current} end
  if redis.call('PTTL', KEYS[3]) <= 0 then return {-1, current} end
end
local next = current + 1
redis.call('SET', KEYS[1], ARGV[2])
redis.call('SET', KEYS[2], next)
return {1, next}
`;

const ACQUIRE_SCRIPT = `
if redis.call('EXISTS', KEYS[1]) == 1 then return {0, redis.call('PTTL', KEYS[1])} end
local token = redis.call('INCR', KEYS[2])
redis.call('HSET', KEYS[1], 'missionId', ARGV[1], 'holderId', ARGV[2], 'fencingToken', token, 'acquiredAt', ARGV[3], 'heartbeatAt', ARGV[3], 'expiresAt', ARGV[4])
redis.call('PEXPIRE', KEYS[1], ARGV[5])
return {1, token}
`;

const HEARTBEAT_SCRIPT = `
if redis.call('HGET', KEYS[1], 'holderId') ~= ARGV[1] then return 0 end
if tonumber(redis.call('HGET', KEYS[1], 'fencingToken') or '-1') ~= tonumber(ARGV[2]) then return 0 end
if redis.call('PTTL', KEYS[1]) <= 0 then return 0 end
redis.call('HSET', KEYS[1], 'heartbeatAt', ARGV[3], 'expiresAt', ARGV[4])
redis.call('PEXPIRE', KEYS[1], ARGV[5])
return 1
`;

const RELEASE_SCRIPT = `
if redis.call('HGET', KEYS[1], 'holderId') ~= ARGV[1] then return 0 end
if tonumber(redis.call('HGET', KEYS[1], 'fencingToken') or '-1') ~= tonumber(ARGV[2]) then return 0 end
return redis.call('DEL', KEYS[1])
`;

const READ_LEASE_SCRIPT = `
if redis.call('EXISTS', KEYS[1]) == 0 or redis.call('PTTL', KEYS[1]) <= 0 then return nil end
return redis.call('HMGET', KEYS[1], 'missionId', 'holderId', 'fencingToken', 'acquiredAt', 'expiresAt', 'heartbeatAt')
`;

export class DurableExecutionStore implements ExecutionStore {
  readonly kind = "durable" as const;
  constructor(private readonly redis: RuntimeRedis = requireRedis()) {}

  async load(): Promise<ExecutionSnapshot> {
    try {
      const [stored, rawVersion] = await Promise.all([
        this.redis.get<ExecutionState>(KEY),
        this.redis.get<number>(VERSION),
      ]);
      return { version: Number(rawVersion ?? 0), state: normalizeExecutionState(stored), updatedAt: new Date().toISOString() };
    } catch { throw new StoreUnavailableError(); }
  }

  async save(state: ExecutionState, options: { expectedVersion: number; lease?: LeaseGuard }) {
    const previous = await this.load();
    assertAppendOnly(previous.state, state);
    const normalized = normalizeExecutionState(state);
    const nextVersion = options.expectedVersion + 1;
    normalized.missions = normalized.missions.map((mission) => {
      const old = previous.state.missions.find((item) => item.id === mission.id);
      return JSON.stringify(old) === JSON.stringify(mission) ? mission : { ...mission, version: nextVersion };
    });
    const lease = options.lease;
    let result: unknown;
    try {
      result = await this.redis.eval(SAVE_SCRIPT, [KEY, VERSION, lease ? leaseKey(lease.missionId) : ""], [String(options.expectedVersion), JSON.stringify(normalized), lease?.holderId ?? "", String(lease?.fencingToken ?? "")]);
    } catch { throw new StoreUnavailableError(); }
    const [status, version] = result as [number, number];
    if (Number(status) === -1) throw new FencingTokenError();
    if (Number(status) !== 1) throw new ExecutionConflictError(Number(version));
    return { version: Number(version), state: normalized, updatedAt: new Date().toISOString() };
  }

  async getMission(id: string) { return (await this.load()).state.missions.find((mission) => mission.id === id) ?? null; }
  async saveMission(mission: ExecutionMission, expectedVersion: number, lease?: LeaseGuard) {
    const snapshot = await this.load();
    const exists = snapshot.state.missions.some((item) => item.id === mission.id);
    snapshot.state.missions = exists ? snapshot.state.missions.map((item) => item.id === mission.id ? mission : item) : [...snapshot.state.missions, mission];
    await this.save(snapshot.state, { expectedVersion, lease });
  }
  async getExecution(id: string): Promise<ExecutionState | null> {
    const snapshot = await this.load();
    return snapshot.state.missions.some((mission) => mission.id === id) ? snapshot.state : null;
  }
  async appendEvent(event: ExecutionEvent) {
    const claimed = await this.claimIdempotency("event", event.id);
    if (!claimed) return;
    try {
      await this.redis.lpush(EVENTS, JSON.stringify(event));
      await this.redis.ltrim(EVENTS, 0, 999);
      await this.completeIdempotency("event", event.id, { stored: true });
    } catch { throw new StoreUnavailableError(); }
  }
  async listEvents(limit = 100) {
    try {
      const rows = await this.redis.lrange<string>(EVENTS, 0, Math.max(0, limit - 1));
      return rows.map((row) => typeof row === "string" ? JSON.parse(row) as ExecutionEvent : row as ExecutionEvent);
    } catch { throw new StoreUnavailableError(); }
  }
  async listPendingMissions() {
    return (await this.load()).state.missions.filter((mission) =>
      ["PLANNED", "open", "ACTIVE", "EXECUTING", "REVIEWING", "REPLAN_REQUIRED"].includes(mission.status),
    );
  }
  async acquireLease(missionId: string, holderId: string, ttlMs: number, now = new Date()) {
    const expiresAt = new Date(now.getTime() + ttlMs).toISOString();
    let result: unknown;
    try { result = await this.redis.eval(ACQUIRE_SCRIPT, [leaseKey(missionId), fenceKey(missionId)], [missionId, holderId, now.toISOString(), expiresAt, String(ttlMs)]); }
    catch { throw new StoreUnavailableError(); }
    const [ok, token] = result as [number, number];
    return Number(ok) === 1 ? { missionId, holderId, fencingToken: Number(token), acquiredAt: now.toISOString(), heartbeatAt: now.toISOString(), expiresAt } : null;
  }
  async heartbeatLease(guard: LeaseGuard, ttlMs: number, now = new Date()) {
    const expiresAt = new Date(now.getTime() + ttlMs).toISOString();
    const ok = await this.redis.eval(HEARTBEAT_SCRIPT, [leaseKey(guard.missionId)], [guard.holderId, String(guard.fencingToken), now.toISOString(), expiresAt, String(ttlMs)]);
    if (Number(ok) !== 1) throw new FencingTokenError();
    const current = await this.getLease(guard.missionId);
    if (!current) throw new FencingTokenError();
    return current;
  }
  async releaseLease(guard: LeaseGuard) {
    const ok = await this.redis.eval(RELEASE_SCRIPT, [leaseKey(guard.missionId)], [guard.holderId, String(guard.fencingToken)]);
    if (Number(ok) !== 1) throw new FencingTokenError();
  }
  async getLease(missionId: string) {
    const row = await this.redis.eval(READ_LEASE_SCRIPT, [leaseKey(missionId)], []);
    if (!row) return null;
    const [storedMissionId, holderId, token, acquiredAt, expiresAt, heartbeatAt] = row as string[];
    return { missionId: storedMissionId, holderId, fencingToken: Number(token), acquiredAt, expiresAt, heartbeatAt };
  }
  async claimIdempotency(scope: string, key: string, ttlSeconds = 604800) {
    try { return (await this.redis.set(idemKey(scope, key), JSON.stringify({ status: "PROCESSING" }), { nx: true, ex: ttlSeconds })) === "OK"; }
    catch { throw new StoreUnavailableError(); }
  }
  async completeIdempotency(scope: string, key: string, result: unknown, ttlSeconds = 604800) {
    try { await this.redis.set(idemKey(scope, key), JSON.stringify({ status: "COMPLETE", result }), { ex: ttlSeconds }); }
    catch { throw new StoreUnavailableError(); }
  }
  async getIdempotencyResult<T>(scope: string, key: string) {
    try {
      const value = await this.redis.get<{ status: string; result?: T } | string>(idemKey(scope, key));
      const parsed = typeof value === "string" ? JSON.parse(value) : value;
      return parsed?.status === "COMPLETE" ? parsed.result ?? null : null;
    } catch { throw new StoreUnavailableError(); }
  }
}

function requireRedis(): RuntimeRedis {
  const redis = getRedisClient();
  if (!redis) throw new StoreUnavailableError("UPSTASH_REDIS_REQUIRED");
  return redis;
}
