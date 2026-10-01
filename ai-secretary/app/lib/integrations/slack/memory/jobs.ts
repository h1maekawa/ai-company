import { randomUUID } from "node:crypto";
import { getExecutionStore, loadExecutionState, saveExecutionState } from "../../../company/execution/store";
import { ExecutionConflictError } from "../../../company/runtime/runtimeTypes";
import { appendTurn, editConversation, fingerprint, loadConversation } from "./store";
import { analyzeConversationMemory, shouldAnalyze } from "./extractor";
import { promoteMemoryCandidates } from "./promotion";
import type { MemoryOperation, SlackMemoryRuntime, SlackMemoryWriteJob } from "./types";

const MAX_ATTEMPTS = 3;
export function memoryLog(status: string, id?: string) {
  console.info("[slack-memory]", { status, jobId: id });
}
export async function editMemoryRuntime(edit: (state: SlackMemoryRuntime) => void) {
  for (let i = 0; i < 5; i++) {
    const state = await loadExecutionState();
    const memory = state.slackMemory ?? { jobs: [], metrics: {} };
    edit(memory);
    try { await saveExecutionState({ ...state, slackMemory: memory }); return; }
    catch (error) { if (!(error instanceof ExecutionConflictError) || i === 4) throw error; }
  }
}
export async function applyMemoryOperation(op: MemoryOperation): Promise<Record<string, number>> {
  if (op.kind === "turn") { const saved = await appendTurn(op.path, op.turn); return { rawSaves: Number(saved.inserted), receivedConversations: Number(saved.created) }; }
  if (op.kind === "transcript") {
    await editConversation(op.path, (a) => {
      if (!a) throw new Error("USER_RAW_PENDING");
      const turn = a.turns.find((t) => t.id === op.turnId);
      if (!turn) throw new Error("USER_RAW_PENDING");
      if (turn.transcript !== op.text) a.analyzedTurnIds = a.analyzedTurnIds.filter((id) => id !== turn.id);
      turn.transcript = op.text; turn.redacted ||= op.redacted; return a;
    });
    return {};
  }
  if (op.kind === "refs") {
    await editConversation(op.path, (a) => {
      if (!a) throw new Error("USER_RAW_PENDING");
      a.researchArtifactRefs = [...new Set([...a.researchArtifactRefs, ...op.research])];
      a.generatedArtifactRefs = [...new Set([...a.generatedArtifactRefs, ...op.generated])];
      return a;
    });
    return {};
  }
  const a = await loadConversation(op.path);
  if (!a) throw new Error("USER_RAW_PENDING");
  if (!a.turns.some((turn) => turn.id === op.throughTurnId)) throw new Error("USER_RAW_PENDING");
  if (!shouldAnalyze(a, op.force || Boolean(op.confirmedViewpoint))) return {};
  memoryLog("DERIVED_PENDING");
  const analysis = await analyzeConversationMemory(a, op.confirmedViewpoint);
  memoryLog("DERIVED_SAVED");
  // Save analysis before promotion; a failed promotion is replayable without losing raw turns.
  await editConversation(op.path, (current) => {
    if (!current) throw new Error("USER_RAW_PENDING");
    current.analysis = analysis; current.pipelineStatus = "PROMOTION_PENDING"; return current;
  });
  memoryLog("PROMOTION_PENDING");
  const links = await promoteMemoryCandidates(a, analysis);
  await editConversation(op.path, (current) => {
    if (!current) throw new Error("USER_RAW_PENDING");
    current.analysis = analysis;
    current.derived = [...current.derived, ...links.filter((link) => !current.derived.some((d) => d.fingerprint === link.fingerprint))];
    current.analyzedTurnIds = [...new Set([...current.analyzedTurnIds, ...a.turns.map((t) => t.id)])];
    current.status = current.turns.length === a.turns.length ? "summarized" : "active";
    current.pipelineStatus = "COMPLETE"; return current;
  });
  return { derivedAnalyses: 1, decisionsExtracted: analysis.decisions.length - (a.analysis?.decisions.length ?? 0),
    tasksExtracted: analysis.nextActions.length - (a.analysis?.nextActions.length ?? 0),
    knowledgeCandidates: links.filter((l) => l.kind === "knowledge" && !a.derived.some((d) => d.fingerprint === l.fingerprint)).length };
}

export async function runMemoryJob(id: string, now = new Date()): Promise<void> {
  const store = getExecutionStore();
  const before = (await loadExecutionState()).slackMemory?.jobs.find((job) => job.id === id);
  if (!before || before.status === "failed" || Date.parse(before.nextAttemptAt) > now.getTime()) return;
  // Shared per-conversation lease serializes analyses and promotions across Vercel invocations.
  const lease = await store.acquireLease(`slack-memory:${fingerprint(before.conversationPath)}`, randomUUID(), 120000);
  if (!lease) return;
  try {
    if (before.operation.kind === "analyze") {
      // A failed read must reach the counted attempt below, not evade the retry limit.
      const artifact = await loadConversation(before.conversationPath).catch(() => null);
      const pending = (await loadExecutionState()).slackMemory?.jobs.some((other) => other.id !== id && other.conversationPath === before.conversationPath && other.operation.kind !== "analyze" && other.status === "pending");
      const idleAt = artifact ? Date.parse(artifact.updatedAt) + 30 * 60000 : 0;
      if (pending || (before.operation.force && idleAt > now.getTime())) {
        await editMemoryRuntime((memory) => {
          const job = memory.jobs.find((j) => j.id === id);
          if (job) job.nextAttemptAt = new Date(Math.max(now.getTime() + 120000, before.operation.kind === "analyze" && before.operation.force ? idleAt : 0)).toISOString();
        });
        return;
      }
    }
    let job: SlackMemoryWriteJob | undefined;
    await editMemoryRuntime((memory) => {
      job = undefined;
      const found = memory.jobs.find((j) => j.id === id);
      if (!found || found.status === "failed" || Date.parse(found.nextAttemptAt) > now.getTime()) return;
      if (found.attempts >= MAX_ATTEMPTS) { found.status = "failed"; found.lastError = "MEMORY_RETRY_EXHAUSTED"; return; }
      found.attempts++;
      // A terminated invocation is retried by the next maintenance run, never every request.
      found.nextAttemptAt = new Date(now.getTime() + 120000).toISOString();
      memory.metrics.retryCount = (memory.metrics.retryCount ?? 0) + (found.attempts > 1 ? 1 : 0);
      job = structuredClone(found);
    });
    if (!job) return;
    try {
      const metrics = await applyMemoryOperation(job.operation);
      await editMemoryRuntime((memory) => {
        memory.jobs = memory.jobs.filter((j) => j.id !== id || j.fingerprint !== job!.fingerprint);
        for (const [key, value] of Object.entries(metrics)) memory.metrics[key] = (memory.metrics[key] ?? 0) + value;
      });
      memoryLog(job.operation.kind === "turn" ? job.operation.turn.role === "user" ? "RAW_SAVED" : "AI_REPLIED" : "COMPLETE", id);
    } catch {
      await editMemoryRuntime((memory) => {
        const found = memory.jobs.find((j) => j.id === id);
        if (!found || found.fingerprint !== job!.fingerprint) return;
        found.lastError = job!.operation.kind === "analyze" ? "MEMORY_ANALYSIS_OR_PROMOTION_FAILED" : "MEMORY_WRITE_FAILED";
        found.status = found.attempts >= MAX_ATTEMPTS ? "failed" : "pending";
        found.nextAttemptAt = new Date(now.getTime() + 120000).toISOString();
        memory.metrics.saveFailures = (memory.metrics.saveFailures ?? 0) + 1;
      });
      memoryLog("FAILED", id);
    }
  } finally { await store.releaseLease(lease); }
}

/** Sanitized payload is durable BEFORE trying Vault. Deleted immediately after successful delivery. */
export async function recordOperation(operation: MemoryOperation, eventId: string, delayMs = 0): Promise<void> {
  const payloadFingerprint = fingerprint(JSON.stringify(operation));
  const idle = operation.kind === "analyze" && operation.force;
  const id = operation.kind === "turn" ? fingerprint(`${operation.path}:${operation.turn.id}`) : idle ? fingerprint(`idle:${operation.path}`) : payloadFingerprint;
  let queued = false;
  try {
    await editMemoryRuntime((memory) => {
      const existing = memory.jobs.find((j) => j.id === id);
      if (existing) {
        // One inactivity job per daily conversation, not one per message.
        if (idle && existing.status === "pending") {
          existing.operation = operation; existing.eventId = eventId; existing.fingerprint = payloadFingerprint;
          existing.attempts = 0; existing.lastError = undefined;
          existing.nextAttemptAt = new Date(Date.now() + delayMs).toISOString();
        }
        return;
      }
      if (memory.jobs.length >= 1000) throw new Error("MEMORY_OUTBOX_FULL");
      const at = new Date().toISOString();
      memory.jobs.push({ id, eventId, conversationPath: operation.path, fingerprint: payloadFingerprint, operation,
        attempts: 0, status: "pending", nextAttemptAt: new Date(Date.now() + delayMs).toISOString(), createdAt: at });
      if (operation.kind === "turn" && operation.turn.role === "user") memory.metrics.receivedTurns = (memory.metrics.receivedTurns ?? 0) + 1;
    });
    queued = true;
    if (!delayMs) await runMemoryJob(id);
  } catch {
    memoryLog(queued ? "MEMORY_RETRY_PENDING" : "MEMORY_OUTBOX_UNAVAILABLE", id);
    // Independent Vault attempt preserves raw data even if the execution store is down.
    if (!queued && operation.kind !== "analyze") {
      try { await applyMemoryOperation(operation); } catch { memoryLog("MEMORY_WRITE_AND_OUTBOX_FAILED", id); }
    }
  }
}

/** Existing authenticated runtime cron and DM background call this; no new scheduler or DB. */
export async function drainSlackMemoryJobs(limit = 4): Promise<void> {
  try {
    const jobs = (await loadExecutionState()).slackMemory?.jobs ?? [];
    for (const job of jobs.filter((j) => j.status === "pending" && Date.parse(j.nextAttemptAt) <= Date.now())
      .sort((a, b) => (a.operation.kind === "analyze" ? 1 : 0) - (b.operation.kind === "analyze" ? 1 : 0)).slice(0, limit)) await runMemoryJob(job.id);
  } catch { memoryLog("MEMORY_MAINTENANCE_UNAVAILABLE"); }
}
