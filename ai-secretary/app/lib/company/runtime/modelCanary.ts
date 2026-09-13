import { randomUUID } from "node:crypto";
import { internalStepWorker } from "../execution/stepWorker";
import { runReviewPipeline } from "../execution/reviewer";
import { CanaryResultStore } from "./canaryStore";

export async function runRealModelCanary(store = new CanaryResultStore()) {
  const id = "canary:" + randomUUID();
  const startedAt = new Date();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20_000);
  let status: "PASS" | "FAIL" = "FAIL";
  let outputLength: number | undefined;
  let reviewVerdict: "PASS" | "WARN" | "FAIL" | undefined;
  let error: string | undefined;
  try {
    const output = await internalStepWorker({
      objective: "Runtime canary: return a short operational acknowledgement.",
      context: "Synthetic canary data. No external action is authorized.",
      step: { id, order: 1, title: "Return CANARY_OK and one short sentence", type: "generate", status: "PENDING" },
      signal: controller.signal,
    });
    outputLength = output.length;
    if (!output.trim() || output.length > 2_000) throw new Error("INVALID_CANARY_OUTPUT");
    reviewVerdict = runReviewPipeline({
      quality: { objective: "Runtime canary acknowledgement", output, expectedOutputs: ["short acknowledgement"] },
      security: { output, externalContent: "Synthetic canary data." },
    }).verdict;
    if (reviewVerdict !== "PASS") throw new Error("CANARY_REVIEW_FAILED");
    status = "PASS";
  } catch (cause) {
    error = cause instanceof Error ? cause.message : "CANARY_FAILED";
  } finally {
    clearTimeout(timer);
  }
  const completedAt = new Date();
  const result = { id, status, startedAt: startedAt.toISOString(), completedAt: completedAt.toISOString(), latencyMs: completedAt.getTime() - startedAt.getTime(), outputLength, reviewVerdict, error };
  await store.save(result);
  const recent = await store.recent(3);
  return { ...result, consecutiveFailures: recent.findIndex((item) => item.status === "PASS") < 0 ? recent.length : recent.findIndex((item) => item.status === "PASS") };
}
