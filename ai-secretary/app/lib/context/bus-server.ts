import fs from "fs";
import { ContextBus, serializeBus, parseBus, createDefaultBus, InboxItem, TaskNode } from "./bus";
import { getBusFilePath, getBusDir } from "../runtime/bus";
import { getRedisClient, REDIS_KEYS } from "../utils/redis";
import { runtimeEnvironment } from "../company/runtime/environment";

// Resolved via runtime/bus.ts — supports local (memory/) and Vercel (/tmp) environments
const BUS_FILE_PATH = getBusFilePath();

// ---------------------------------------------------------------------------
// Atomic Redis read helpers
// ---------------------------------------------------------------------------

type RedisQueues = {
  companyInbox: InboxItem[];
  companyPipeline: TaskNode[];
  personalInbox: InboxItem[];
  personalPipeline: TaskNode[];
};
const busVersion = Symbol("bus-read-version");
type VersionedBus = ContextBus & { [busVersion]?: number };
const keys = [REDIS_KEYS.companyInbox, REDIS_KEYS.companyPipeline, REDIS_KEYS.personalInbox, REDIS_KEYS.personalPipeline, REDIS_KEYS.version, REDIS_KEYS.snapshot];
const READ_SCRIPT = `return {redis.call('GET', KEYS[1]), redis.call('GET', KEYS[2]), redis.call('GET', KEYS[3]), redis.call('GET', KEYS[4]), redis.call('GET', KEYS[5]), redis.call('GET', KEYS[6])}`;
const WRITE_SCRIPT = `
local current = tonumber(redis.call('GET', KEYS[5]) or '0')
if current ~= tonumber(ARGV[1]) then return {0, current} end
redis.call('SET', KEYS[1], ARGV[2])
redis.call('SET', KEYS[2], ARGV[3])
redis.call('SET', KEYS[3], ARGV[4])
redis.call('SET', KEYS[4], ARGV[5])
redis.call('SET', KEYS[5], current + 1)
redis.call('SET', KEYS[6], ARGV[6])
return {1, current + 1}
`;
function parseRedisJson<T>(value: unknown): T {
  return (typeof value === "string" ? JSON.parse(value) : value) as T;
}
function bindVersion(bus: ContextBus, version: number): ContextBus {
  Object.defineProperty(bus, busVersion, { value: version, enumerable: true, configurable: true });
  return bus;
}

async function readFromRedis(): Promise<{ queues: RedisQueues | null; version: number; snapshot: ContextBus | null }> {
  const client = getRedisClient();
  if (!client) throw new Error("BUS_REDIS_REQUIRED");
  try {
    const row = await client.eval(READ_SCRIPT, keys, []) as unknown[];
    const snapshot = row[5] ? parseBus(typeof row[5] === "string" ? row[5] : JSON.stringify(row[5])) : null;
    if (row.slice(0, 4).every((value) => value === null)) {
      if (snapshot || row[4] !== null) throw new Error("BUS_PARTIAL_STATE");
      return { queues: null, version: Number(row[4] ?? 0), snapshot: null };
    }
    if (row.slice(0, 4).some((value) => value === null)) throw new Error("BUS_PARTIAL_STATE");
    const queues = {
      companyInbox: parseRedisJson<InboxItem[]>(row[0]), companyPipeline: parseRedisJson<TaskNode[]>(row[1]),
      personalInbox: parseRedisJson<InboxItem[]>(row[2]), personalPipeline: parseRedisJson<TaskNode[]>(row[3]),
    } as RedisQueues;
    if (snapshot && (JSON.stringify(snapshot.company?.inboxQueue ?? []) !== JSON.stringify(queues.companyInbox)
      || JSON.stringify(snapshot.company?.taskPipeline ?? []) !== JSON.stringify(queues.companyPipeline)
      || JSON.stringify(snapshot.personal?.inboxQueue ?? []) !== JSON.stringify(queues.personalInbox)
      || JSON.stringify(snapshot.personal?.taskPipeline ?? []) !== JSON.stringify(queues.personalPipeline))) throw new Error("BUS_SNAPSHOT_MISMATCH");
    return { queues, version: Number(row[4] ?? 0), snapshot };
  } catch { throw new Error("BUS_REDIS_READ_FAILED"); }
}

// ---------------------------------------------------------------------------
// Atomic Redis write helpers
// ---------------------------------------------------------------------------

async function writeToRedis(bus: ContextBus): Promise<void> {
  const client = getRedisClient();
  if (!client) throw new Error("BUS_REDIS_REQUIRED");
  const expected = (bus as VersionedBus)[busVersion];
  if (expected === undefined) throw new Error("BUS_EXPECTED_VERSION_REQUIRED");
  let result: [number, number];
  try {
    result = await client.eval(WRITE_SCRIPT, keys, [String(expected), JSON.stringify(bus.company?.inboxQueue ?? []), JSON.stringify(bus.company?.taskPipeline ?? []), JSON.stringify(bus.personal?.inboxQueue ?? []), JSON.stringify(bus.personal?.taskPipeline ?? []), serializeBus(bus)]) as [number, number];
  } catch { throw new Error("BUS_REDIS_WRITE_FAILED"); }
  if (Number(result[0]) !== 1) throw new Error("BUS_CONFLICT");
  bindVersion(bus, Number(result[1]));
}

// ---------------------------------------------------------------------------
// loadBus — hosted Redis is authoritative; local development may use a file
// ---------------------------------------------------------------------------

/**
 * Loads ContextBus state.
 * Hosted: Redis only. Local development without Redis: file or default.
 */
export async function loadBus(): Promise<ContextBus> {
  const useRedis = Boolean(getRedisClient()) || runtimeEnvironment().stage !== "development";
  // Hosted instances must never substitute an ephemeral file for Redis.
  const redisState = useRedis ? await readFromRedis() : null;
  // The local file is used only when no Redis client is configured.
  let fileBus: ContextBus | null = null;
  if (!useRedis && fs.existsSync(BUS_FILE_PATH)) {
    const content = fs.readFileSync(BUS_FILE_PATH, "utf-8");
    if (content && content.trim()) fileBus = parseBus(content);
  }

  // Legacy queue keys remain readable; a full snapshot preserves bus metadata.
  const redisQueues = redisState?.queues;
  const base = useRedis ? (redisState?.snapshot ?? createDefaultBus()) : (fileBus ?? createDefaultBus());
  if (redisQueues) {
    return bindVersion({
      ...base,
      company: {
        ...base.company,
        inboxQueue:   redisQueues.companyInbox,
        taskPipeline: redisQueues.companyPipeline,
      },
      personal: {
        ...base.personal,
        inboxQueue:   redisQueues.personalInbox,
        taskPipeline: redisQueues.personalPipeline,
      },
    }, redisState!.version);
  }

  return bindVersion(base, redisState?.version ?? 0);
}

// ---------------------------------------------------------------------------
// saveBus — Redis first, optional file mirror
// ---------------------------------------------------------------------------

/**
 * Saves ContextBus state.
 * Order: Redis (source of truth) → file (mirror, EROFS-safe)
 */
export async function saveBus(bus: ContextBus): Promise<void> {
  const useRedis = Boolean(getRedisClient()) || runtimeEnvironment().stage !== "development";
  if (useRedis) await writeToRedis(bus);

  // Phase D: Write to file (mirror) with EROFS fallback
  const dir = getBusDir();
  try {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(BUS_FILE_PATH, serializeBus(bus), "utf-8");
  } catch (err: any) {
    if (err.code === "EROFS" && BUS_FILE_PATH !== "/tmp/current-bus.json") {
      console.warn(`[bus-server] EROFS on ${BUS_FILE_PATH}, falling back to /tmp/current-bus.json`);
      try {
        fs.writeFileSync("/tmp/current-bus.json", serializeBus(bus), "utf-8");
      } catch (innerErr) {
        console.error("[bus-server] /tmp fallback also failed", innerErr);
        if (!useRedis) throw innerErr;
      }
    } else {
      // Non-EROFS error on file write — log but don't block (Redis is source of truth)
      console.error("[bus-server] Unexpected file write error", err);
      if (!useRedis) throw err;
    }
  }
}
