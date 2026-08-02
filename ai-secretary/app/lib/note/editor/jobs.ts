import { randomUUID } from "crypto";
import type { Redis } from "@upstash/redis";
import { getRedisClient } from "../../utils/redis";
import type {
  LocalAiReviewInput,
  LocalAiReviewJob,
  LocalAiReviewResult,
} from "./types";

const PREFIX = "maemichi:local-ai:review";
const PENDING_KEY = `${PREFIX}:pending`;
const RUNNING_KEY = `${PREFIX}:running`;
const JOB_TTL_SECONDS = 7 * 24 * 60 * 60;

type JobRedis = Pick<
  Redis,
  "get" | "set" | "expire" | "lpush" | "rpop" | "zadd" | "zrange" | "zrem"
>;

export class LocalAiQueueUnavailableError extends Error {
  constructor() {
    super("Local AI添削にはUpstash Redisが必要です");
    this.name = "LocalAiQueueUnavailableError";
  }
}

function jobKey(id: string) {
  return `${PREFIX}:job:${id}`;
}

function requireRedis(): JobRedis {
  const redis = getRedisClient();
  if (!redis) throw new LocalAiQueueUnavailableError();
  return redis;
}

async function saveJob(redis: JobRedis, job: LocalAiReviewJob): Promise<void> {
  await redis.set(jobKey(job.id), job);
  await redis.expire(jobKey(job.id), JOB_TTL_SECONDS);
}

export async function createLocalAiReviewJob(
  input: LocalAiReviewInput,
  redis: JobRedis = requireRedis()
): Promise<LocalAiReviewJob> {
  const now = new Date().toISOString();
  const job: LocalAiReviewJob = {
    id: `edit_${randomUUID()}`,
    status: "pending",
    input,
    attempt: 0,
    createdAt: now,
    updatedAt: now,
  };
  await saveJob(redis, job);
  await redis.lpush(PENDING_KEY, job.id);
  return job;
}

export async function getLocalAiReviewJob(
  id: string,
  redis: JobRedis = requireRedis()
): Promise<LocalAiReviewJob | null> {
  return (await redis.get<LocalAiReviewJob>(jobKey(id))) ?? null;
}

export async function requeueExpiredLocalAiJobs(
  nowMs = Date.now(),
  redis: JobRedis = requireRedis()
): Promise<number> {
  const ids = await redis.zrange<string[]>(RUNNING_KEY, 0, nowMs, { byScore: true });
  let requeued = 0;
  for (const id of ids) {
    const job = await getLocalAiReviewJob(id, redis);
    if (job?.status === "running" && Date.parse(job.claimExpiresAt ?? "") <= nowMs) {
      const next: LocalAiReviewJob = {
        ...job,
        status: "pending",
        claimToken: undefined,
        claimedBy: undefined,
        claimExpiresAt: undefined,
        updatedAt: new Date(nowMs).toISOString(),
      };
      await saveJob(redis, next);
      await redis.lpush(PENDING_KEY, id);
      requeued += 1;
    }
    await redis.zrem(RUNNING_KEY, id);
  }
  return requeued;
}

export async function claimNextLocalAiReviewJob(
  workerId: string,
  timeoutSeconds: number,
  redis: JobRedis = requireRedis()
): Promise<LocalAiReviewJob | null> {
  await requeueExpiredLocalAiJobs(Date.now(), redis);
  const id = await redis.rpop<string>(PENDING_KEY);
  if (!id) return null;

  const job = await getLocalAiReviewJob(id, redis);
  if (!job || job.status !== "pending") return null;

  const now = Date.now();
  const claimToken = randomUUID();
  const claimed: LocalAiReviewJob = {
    ...job,
    status: "running",
    attempt: job.attempt + 1,
    claimToken,
    claimedBy: workerId,
    claimExpiresAt: new Date(now + timeoutSeconds * 1000).toISOString(),
    updatedAt: new Date(now).toISOString(),
  };
  await saveJob(redis, claimed);
  await redis.zadd(RUNNING_KEY, {
    score: now + timeoutSeconds * 1000,
    member: id,
  });
  return claimed;
}

function assertClaim(job: LocalAiReviewJob | null, claimToken: string): LocalAiReviewJob {
  if (!job || job.status !== "running" || job.claimToken !== claimToken) {
    throw new Error("Local AI添削ジョブのclaimが無効です");
  }
  return job;
}

export async function completeLocalAiReviewJob(
  id: string,
  claimToken: string,
  result: LocalAiReviewResult,
  redis: JobRedis = requireRedis()
): Promise<LocalAiReviewJob> {
  const job = assertClaim(await getLocalAiReviewJob(id, redis), claimToken);
  const now = new Date().toISOString();
  const completed: LocalAiReviewJob = {
    ...job,
    status: "completed",
    result,
    claimToken: undefined,
    claimedBy: undefined,
    claimExpiresAt: undefined,
    completedAt: now,
    updatedAt: now,
  };
  await saveJob(redis, completed);
  await redis.zrem(RUNNING_KEY, id);
  return completed;
}

export async function failLocalAiReviewJob(
  id: string,
  claimToken: string,
  errorCode: string,
  redis: JobRedis = requireRedis()
): Promise<LocalAiReviewJob> {
  const job = assertClaim(await getLocalAiReviewJob(id, redis), claimToken);
  const now = new Date().toISOString();
  const failed: LocalAiReviewJob = {
    ...job,
    status: "failed",
    errorCode,
    claimToken: undefined,
    claimedBy: undefined,
    claimExpiresAt: undefined,
    updatedAt: now,
  };
  await saveJob(redis, failed);
  await redis.zrem(RUNNING_KEY, id);
  return failed;
}

export async function decideLocalAiReviewJob(
  id: string,
  decision: "adopted" | "rejected",
  redis: JobRedis = requireRedis()
): Promise<LocalAiReviewJob> {
  const job = await getLocalAiReviewJob(id, redis);
  if (!job || job.status !== "completed") {
    throw new Error("完了していない添削ジョブは採用・却下できません");
  }
  const now = new Date().toISOString();
  const decided: LocalAiReviewJob = {
    ...job,
    status: decision,
    adoptedAt: decision === "adopted" ? now : undefined,
    rejectedAt: decision === "rejected" ? now : undefined,
    updatedAt: now,
  };
  await saveJob(redis, decided);
  return decided;
}

