import os from "os";
import type { LocalAiReviewJob } from "../app/lib/note/editor/types";

const baseUrl = process.env.APP_BASE_URL?.replace(/\/$/, "");
const workerToken = process.env.MAEMICHI_LOCAL_AI_WORKER_TOKEN;
const workerId = process.env.MAEMICHI_LOCAL_AI_WORKER_ID || `${os.hostname()}-${process.pid}`;
const pollIntervalMs = Number(process.env.MAEMICHI_LOCAL_AI_POLL_INTERVAL_MS ?? 5000);

if (!baseUrl) throw new Error("APP_BASE_URL が未設定です");
if (!workerToken) throw new Error("MAEMICHI_LOCAL_AI_WORKER_TOKEN が未設定です");
if (process.env.MAEMICHI_LOCAL_AI_PROVIDER !== "ollama") {
  throw new Error("MAEMICHI_LOCAL_AI_PROVIDER=ollama を設定してください");
}
if (process.env.MAEMICHI_LOCAL_AI_FALLBACK_TO_CLOUD === "true") {
  throw new Error("クラウドAIへの自動フォールバックは許可されていません");
}
if (process.env.MAEMICHI_LOCAL_AI_MODEL) {
  process.env.OLLAMA_MODEL = process.env.MAEMICHI_LOCAL_AI_MODEL;
}

const headers = {
  Authorization: `Bearer ${workerToken}`,
  "Content-Type": "application/json",
  "X-Worker-Id": workerId,
};

async function report(
  job: LocalAiReviewJob,
  outcome: "complete" | "fail",
  payload: Record<string, unknown>
) {
  const response = await fetch(
    `${baseUrl}/api/local-runner/maemichi/edit/jobs/${job.id}/${outcome}`,
    {
      method: "POST",
      headers,
      body: JSON.stringify({ claimToken: job.claimToken, ...payload }),
    }
  );
  if (!response.ok) throw new Error(`結果報告に失敗しました: HTTP ${response.status}`);
}

async function runJob(job: LocalAiReviewJob) {
  try {
    const [{ reviewWithLocalAi }, { validatePreservation }] = await Promise.all([
      import("../app/lib/note/editor/review"),
      import("../app/lib/note/editor/preservation"),
    ]);
    const result = await reviewWithLocalAi(job);
    const issues = validatePreservation(job.input, result);
    if (issues.some((issue) => issue.severity === "error")) {
      await report(job, "fail", { errorCode: "PRESERVATION_VIOLATION" });
      return;
    }
    await report(job, "complete", { result });
  } catch (error) {
    const code =
      error instanceof Error && error.name === "AbortError"
        ? "OLLAMA_TIMEOUT"
        : "LOCAL_AI_FAILED";
    await report(job, "fail", { errorCode: code });
  }
}

async function poll() {
  const response = await fetch(
    `${baseUrl}/api/local-runner/maemichi/edit/jobs/next`,
    { headers, cache: "no-store" }
  );
  if (!response.ok) throw new Error(`ジョブ取得に失敗しました: HTTP ${response.status}`);
  const data = (await response.json()) as { job?: LocalAiReviewJob | null };
  if (data.job) await runJob(data.job);
}

async function main() {
  console.log(`[local-ai-worker] started worker=${workerId}`);
  for (;;) {
    try {
      await poll();
    } catch (error) {
      console.error("[local-ai-worker] polling failed", {
        errorType: error instanceof Error ? error.name : "unknown",
      });
    }
    await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
  }
}

void main();

