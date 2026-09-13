import { randomUUID } from "node:crypto";
import { internalStepWorker } from "../execution/stepWorker";
import { runReviewPipeline } from "../execution/reviewer";
import { CanaryResultStore } from "./canaryStore";
import type { StepWorker } from "../execution/agentRunner";
import { runtimeLog } from "./runtimeLog";
import { CANARY_ACK, CANARY_EXPECTED_OUTPUTS, CANARY_EXTERNAL_CONTEXT, CANARY_OBJECTIVE } from "./canaryContract";

export async function runRealModelCanary(store = new CanaryResultStore(), worker: StepWorker = internalStepWorker) {
  const id = "canary:" + randomUUID();
  const startedAt = new Date();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20_000);
  let status: "PASS" | "FAIL" = "FAIL";
  let outputLength: number | undefined;
  let reviewVerdict: "PASS" | "WARN" | "FAIL" | undefined;
  let error: string | undefined;
  let schemaValidated = false;
  let security: { status: "PASS" | "ALERT"; alert?: string } = { status: "PASS" };
  try {
    const output = await worker({
      objective: "Runtime canary: return strict JSON with ack CANARY_OK and a short message.",
      context: `${CANARY_EXTERNAL_CONTEXT} No external action is authorized.`,
      step: { id, order: 1, title: `Return {"ack":"${CANARY_ACK}","message":"short sentence"}`, type: "generate", status: "PENDING" },
      signal: controller.signal,
    });
    outputLength = output.length;
    if (!output.trim() || output.length > 2_000) throw new Error("INVALID_CANARY_OUTPUT");
    const json = output.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
    const parsed = JSON.parse(json) as unknown;
    if (!parsed || typeof parsed !== "object" || (parsed as { ack?: unknown }).ack !== CANARY_ACK || typeof (parsed as { message?: unknown }).message !== "string")
      throw new Error("CANARY_SCHEMA_INVALID");
    schemaValidated = true;
    reviewVerdict = runReviewPipeline({
      quality: { objective: CANARY_OBJECTIVE, output, expectedOutputs: CANARY_EXPECTED_OUTPUTS },
      security: { output, externalContent: CANARY_EXTERNAL_CONTEXT },
    }).verdict;
    if (reviewVerdict !== "PASS") {
      security = { status: "ALERT", alert: "CANARY_REVIEW_FAILED" };
      throw new Error("CANARY_REVIEW_FAILED");
    }
    status = "PASS";
  } catch (cause) {
    error = cause instanceof Error ? cause.message : "CANARY_FAILED";
    if (/SECURITY|REVIEW/.test(error)) security = { status: "ALERT", alert: error };
  } finally {
    clearTimeout(timer);
  }
  const completedAt = new Date();
  const result = {
    id, status, startedAt: startedAt.toISOString(), completedAt: completedAt.toISOString(),
    latencyMs: completedAt.getTime() - startedAt.getTime(), outputLength, reviewVerdict, error,
    schemaValidated, redisPersisted: true, cancellationConfigured: true,
    cost: { status: "unknown" as const, reason: "Provider usage metadata is not exposed by callAI" },
    security, externalActionCount: 0 as const,
  };
  await store.save(result);
  const recent = await store.recent(3);
  runtimeLog({ event: "canary.real-model", result: status === "PASS" ? "success" : "failure", latencyMs: result.latencyMs, error: error ? new Error(error) : undefined });
  return { ...result, consecutiveFailures: recent.findIndex((item) => item.status === "PASS") < 0 ? recent.length : recent.findIndex((item) => item.status === "PASS") };
}

export async function runScheduledRealModelCanary(store = new CanaryResultStore()) {
  const period = new Date().toISOString().slice(0, 13);
  if (!(await store.claim(period))) return { status: "SKIPPED" as const, reason: "CANARY_ALREADY_RUN" };
  return runRealModelCanary(store);
}
