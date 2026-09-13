import { randomUUID } from "node:crypto";
import { internalStepWorker } from "../execution/stepWorker";
import { getExecutionStore } from "../execution/store";
import type { ExecutionStore } from "./runtimeTypes";
import { runReviewPipeline } from "../execution/reviewer";

export async function runRealModelCanary(store: ExecutionStore = getExecutionStore()) {
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
  const snapshot = await store.load();
  snapshot.state.runtime ??= { runs: {}, executions: [], artifacts: [], learning: [] };
  snapshot.state.runtime.canaries = [...(snapshot.state.runtime.canaries ?? []).slice(-29), result];
  await store.save(snapshot.state, { expectedVersion: snapshot.version });
  await store.appendEvent({
    id: randomUUID(), type: status === "PASS" ? "CANARY_COMPLETED" : "CANARY_FAILED", detail: error,
    createdAt: completedAt.toISOString(), at: completedAt.toISOString(), kind: "runtime.canary",
    department: "personal", actor: "system", action: "real-model-canary",
    outcome: status === "PASS" ? "success" : "failure", signature: "real-model-canary", humanIntervention: false,
  });
  return result;
}
