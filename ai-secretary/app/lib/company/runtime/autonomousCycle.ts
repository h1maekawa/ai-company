import { randomUUID } from "node:crypto";
import { getExecutionStore } from "../execution/store";
import type { ExecutionStore } from "./runtimeTypes";
import { RUNTIME_DEFAULTS } from "./runtimeConfig";
import { runProductionMission } from "./productionRunner";
import { addAttention } from "./operations";
import { loadRevenueEntries } from "../revenueStore";
import { buildOrganizationSnapshot } from "../organization";
import { generateOpportunities, applyRevenueToOpportunities } from "../opportunity/engine";
import { loadOpportunities, saveOpportunities } from "../opportunity/store";
import { syncRevenueLearning } from "../execution/revenueLearning";
import type { RevenueEntry } from "../revenueStore";
import { runRealModelCanary } from "./modelCanary";
import { startMission } from "../execution/service";
import { runDailyPersonalCompanyReview, runMonthlyPersonalCompanyReview, runWeeklyPersonalCompanyReview } from "../reviews/reviews";
import { saveReview } from "../reviews/store";

const GLOBAL_LEASE = "__autonomous_cycle__";
const cycleEvent = (type: "CYCLE_STARTED" | "CYCLE_COMPLETED" | "CYCLE_FAILED", cycleId: string, detail?: string) => {
  const at = new Date().toISOString();
  return { id: randomUUID(), type, cycleId, holderId: cycleId, detail, createdAt: at, at, kind: "runtime.cycle" as const, department: "personal", actor: cycleId, action: type, outcome: type === "CYCLE_FAILED" ? "failure" as const : "success" as const, signature: type, humanIntervention: false };
};

export async function runAutonomousCycle(options: { store?: ExecutionStore; maxMissions?: number; maxRuntimeMs?: number } = {}) {
  const store = options.store ?? getExecutionStore();
  const cycleId = randomUUID();
  const startedAt = Date.now();
  const maxMissions = Math.min(options.maxMissions ?? RUNTIME_DEFAULTS.maxMissionsPerCycle, RUNTIME_DEFAULTS.maxMissionsPerCycle);
  const maxRuntimeMs = Math.min(options.maxRuntimeMs ?? RUNTIME_DEFAULTS.maxRuntimeMs, RUNTIME_DEFAULTS.maxRuntimeMs);
  const lease = await store.acquireLease(GLOBAL_LEASE, cycleId, RUNTIME_DEFAULTS.globalCycleLeaseTtlMs);
  if (!lease) return { cycleId, status: "SKIPPED" as const, reason: "CYCLE_BUSY", processed: [] };
  await store.appendEvent(cycleEvent("CYCLE_STARTED", cycleId));
  const processed: Array<{ missionId: string; status: string }> = [];
  try {
    const dayKey = new Date().toISOString().slice(0, 10);
    if (await store.claimIdempotency("opportunity-refresh", dayKey)) {
      const [entries, existing] = await Promise.all([loadRevenueEntries().catch(() => []), loadOpportunities().catch(() => [])]);
      const generated = generateOpportunities({ organization: buildOrganizationSnapshot(), revenueEntries: entries, existing });
      await saveOpportunities(applyRevenueToOpportunities(generated.opportunities, entries));
      await store.completeIdempotency("opportunity-refresh", dayKey, { count: generated.opportunities.length });
    }
    const queued = (await store.load()).state.runtime?.learningQueue ?? [];
    for (const item of queued.filter((entry) => Date.parse(entry.nextAttemptAt) <= Date.now()).slice(0, 10)) {
      try {
        if (item.kind === "revenue") await syncRevenueLearning([item.payload as RevenueEntry]);
        const snapshot = await store.load();
        if (snapshot.state.runtime) snapshot.state.runtime.learningQueue = (snapshot.state.runtime.learningQueue ?? []).filter((entry) => entry.id !== item.id);
        await store.save(snapshot.state, { expectedVersion: snapshot.version });
      } catch {
        const snapshot = await store.load();
        const pending = snapshot.state.runtime?.learningQueue?.find((entry) => entry.id === item.id);
        if (pending) {
          pending.attempts += 1;
          pending.nextAttemptAt = new Date(Date.now() + Math.min(3_600_000, 2 ** pending.attempts * 60_000)).toISOString();
          await store.save(snapshot.state, { expectedVersion: snapshot.version });
        }
      }
    }
    const attentionSnapshot = await store.load();
    for (const approval of attentionSnapshot.state.approvals.filter((item) => item.status === "PENDING")) {
      addAttention(attentionSnapshot.state, {
        fingerprint: "approval:" + approval.id,
        missionId: approval.missionId,
        targetId: approval.id,
        type: "APPROVAL_REQUIRED",
        priority: approval.riskLevel === "R4" ? "critical" : "high",
        title: "CEO approval required",
        summary: approval.title,
      });
    }
    for (const mission of attentionSnapshot.state.missions.filter((item) => item.status === "BLOCKED")) {
      addAttention(attentionSnapshot.state, {
        fingerprint: "blocked:" + mission.id,
        missionId: mission.id,
        targetId: mission.id,
        type: "MISSION_BLOCKED",
        priority: "high",
        title: "Mission blocked",
        summary: mission.title,
      });
    }
    await store.save(attentionSnapshot.state, { expectedVersion: attentionSnapshot.version });
    const pending = (await store.listPendingMissions())
      .sort((a, b) => {
        const rank = (status: string) => ["ACTIVE", "EXECUTING", "REVIEWING", "REPLAN_REQUIRED"].includes(status) ? 0 : 1;
        return rank(a.status) - rank(b.status) || (a.estimatedMinutesToRevenue ?? Number.MAX_SAFE_INTEGER) - (b.estimatedMinutesToRevenue ?? Number.MAX_SAFE_INTEGER);
      })
      .slice(0, maxMissions);
    for (const mission of pending) {
      if (Date.now() - startedAt >= maxRuntimeMs) break;
      try {
        if (["PLANNED", "open"].includes(mission.status)) {
          const started = await startMission({ missionId: mission.id });
          if (!started.ok) throw new Error(started.error);
        }
        await runProductionMission({ missionId: mission.id, idempotencyKey: cycleId + ":" + mission.id, store });
        processed.push({ missionId: mission.id, status: "OK" });
      } catch (error) {
        const reason = error instanceof Error ? error.message : "MISSION_RUN_FAILED";
        processed.push({ missionId: mission.id, status: reason });
        const snapshot = await store.load();
        addAttention(snapshot.state, {
          fingerprint: "cycle:" + mission.id + ":" + reason,
          missionId: mission.id,
          type: "SYSTEM_FAILURE",
          priority: reason === "MISSION_BUSY" ? "medium" : "critical",
          title: "Mission execution needs attention",
          summary: reason,
          targetId: mission.id,
        });
        await store.save(snapshot.state, { expectedVersion: snapshot.version });
      }
    }
    for (const [scope, runReview] of [
      ["daily", runDailyPersonalCompanyReview],
      ["weekly", runWeeklyPersonalCompanyReview],
      ["monthly", runMonthlyPersonalCompanyReview],
    ] as const) {
      const periodKey = scope === "daily" ? dayKey : scope === "weekly"
        ? dayKey.slice(0, 8) + String(Math.ceil(Number(dayKey.slice(8)) / 7))
        : dayKey.slice(0, 7);
      if (await store.claimIdempotency("organization-review:" + scope, periodKey)) {
        const review = await runReview();
        await saveReview(review);
        await store.completeIdempotency("organization-review:" + scope, periodKey, { date: review.date });
      }
    }
    if (process.env.ENABLE_REAL_MODEL_CANARY === "true" && await store.claimIdempotency("model-canary", dayKey)) {
      const canary = await runRealModelCanary(store);
      await store.completeIdempotency("model-canary", dayKey, canary);
    }
    await store.appendEvent(cycleEvent("CYCLE_COMPLETED", cycleId, JSON.stringify(processed)));
    return { cycleId, status: "COMPLETED" as const, processed };
  } catch (error) {
    await store.appendEvent(cycleEvent("CYCLE_FAILED", cycleId, error instanceof Error ? error.message : "UNKNOWN"));
    throw error;
  } finally {
    await store.releaseLease(lease).catch(() => undefined);
  }
}
