import fs from "fs";
import { ContextBus, serializeBus, parseBus, createDefaultBus, InboxItem, TaskNode } from "./bus";
import { getBusFilePath, getBusDir } from "../runtime/bus";
import { redisSafeGet, redisSafeSet, REDIS_KEYS } from "../utils/redis";

// Resolved via runtime/bus.ts — supports local (memory/) and Vercel (/tmp) environments
const BUS_FILE_PATH = getBusFilePath();

// ---------------------------------------------------------------------------
// Phase B: Redis Read helpers
// ---------------------------------------------------------------------------

type RedisQueues = {
  companyInbox: InboxItem[];
  companyPipeline: TaskNode[];
  personalInbox: InboxItem[];
  personalPipeline: TaskNode[];
};

async function readFromRedis(): Promise<RedisQueues | null> {
  try {
    const [companyInbox, companyPipeline, personalInbox, personalPipeline] =
      await Promise.all([
        redisSafeGet<InboxItem[]>(REDIS_KEYS.companyInbox),
        redisSafeGet<TaskNode[]>(REDIS_KEYS.companyPipeline),
        redisSafeGet<InboxItem[]>(REDIS_KEYS.personalInbox),
        redisSafeGet<TaskNode[]>(REDIS_KEYS.personalPipeline),
      ]);

    const hasAny =
      companyInbox || companyPipeline || personalInbox || personalPipeline;

    if (!hasAny) return null;

    return {
      companyInbox:    companyInbox    ?? [],
      companyPipeline: companyPipeline ?? [],
      personalInbox:   personalInbox   ?? [],
      personalPipeline:personalPipeline ?? [],
    };
  } catch (err) {
    console.warn("[bus-server] Redis read failed, continuing with file only.", err);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Phase C: Redis Write helpers
// ---------------------------------------------------------------------------

async function writeToRedis(bus: ContextBus): Promise<void> {
  await Promise.all([
    redisSafeSet(REDIS_KEYS.companyInbox,    bus.company?.inboxQueue    ?? []),
    redisSafeSet(REDIS_KEYS.companyPipeline, bus.company?.taskPipeline  ?? []),
    redisSafeSet(REDIS_KEYS.personalInbox,   bus.personal?.inboxQueue   ?? []),
    redisSafeSet(REDIS_KEYS.personalPipeline,bus.personal?.taskPipeline ?? []),
  ]);
  // redisSafeSet never throws — fail-open policy is enforced inside redis.ts
}

// ---------------------------------------------------------------------------
// loadBus — Redis first, file fallback, then default
// ---------------------------------------------------------------------------

/**
 * Loads ContextBus state.
 * Priority: Redis > File > Default
 */
export async function loadBus(): Promise<ContextBus> {
  // 1. Try file first to get full bus shape (includes meta, schemaVersion, etc.)
  let fileBus: ContextBus | null = null;
  try {
    if (fs.existsSync(BUS_FILE_PATH)) {
      const content = fs.readFileSync(BUS_FILE_PATH, "utf-8");
      if (content && content.trim()) {
        fileBus = parseBus(content); // parseBus handles schemaVersion migration
      }
    }
  } catch (e) {
    console.warn(`[bus-server] Bus file not found or invalid at ${BUS_FILE_PATH}.`, e);
  }

  // 2. Overlay Redis data (more recent) on top of file data
  const redisQueues = await readFromRedis();
  const base = fileBus ?? createDefaultBus();
  if (redisQueues) {
    return {
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
    };
  }

  return base;
}

// ---------------------------------------------------------------------------
// saveBus — Redis first, file second (mirror), EROFS-safe
// ---------------------------------------------------------------------------

/**
 * Saves ContextBus state.
 * Order: Redis (source of truth) → file (mirror, EROFS-safe)
 */
export async function saveBus(bus: ContextBus): Promise<void> {
  // Phase C: Write to Redis first (fail-open — errors are swallowed inside writeToRedis)
  await writeToRedis(bus);

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
        // Do not rethrow — Redis already has the data
      }
    } else {
      // Non-EROFS error on file write — log but don't block (Redis is source of truth)
      console.error("[bus-server] Unexpected file write error", err);
    }
  }
}
