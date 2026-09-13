import type { ExecutionState } from "./store";
import type { RevenueEntry } from "../revenueStore";
import { effectiveEntries } from "../revenueStore";
export function safeRevenueContributions(
  entries: RevenueEntry[],
  state: ExecutionState,
) {
  const byAgent: Record<string, number> = {};
  let totalRevenueYen = 0;
  const unique = [
    ...new Map(effectiveEntries(entries).map((e) => [e.id, e])).values(),
  ];
  for (const entry of unique) {
    if (
      !entry.confirmedByHuman ||
      entry.sourceType === "investment" ||
      !Number.isFinite(entry.amountYen) ||
      entry.amountYen <= 0
    )
      continue;
    totalRevenueYen += entry.amountYen;
    const mission = state.missions.find((m) => m.id === entry.missionId);
    const ids = [
      ...new Set(
        [entry.originAgentId, mission?.assignedAgentId].filter(
          (id): id is string => !!id,
        ),
      ),
    ].sort();
    const base = Math.floor(entry.amountYen / (ids.length || 1));
    // Allocate remaining whole yen once; never round each share up.
    let remainder = Math.floor(entry.amountYen) - base * ids.length;
    for (const id of ids)
      byAgent[id] = (byAgent[id] ?? 0) + base + (remainder-- > 0 ? 1 : 0);
  }
  return { byAgent, totalRevenueYen };
}
export function agentPerformance(
  state: ExecutionState,
  revenue: RevenueEntry[],
) {
  const contributions = safeRevenueContributions(revenue, state);
  const ids = new Set(
    state.missions.flatMap((m) =>
      m.assignedAgentId ? [m.assignedAgentId] : [],
    ),
  );
  return [...ids].map((agentId) => {
    const missions = state.missions.filter(
      (m) => m.assignedAgentId === agentId,
    );
    const decisions = state.approvals.filter(
      (a) =>
        a.requestedBy === agentId &&
        ["APPROVED", "REJECTED"].includes(a.status),
    );
    const runs = missions.flatMap((m) =>
      state.runtime?.runs[m.id] ? [state.runtime.runs[m.id]] : [],
    );
    const reviews = runs.flatMap(
      (r) => r.reviewHistory ?? (r.review ? [r.review] : []),
    );
    const latency = missions.flatMap((m) =>
      m.status === "COMPLETED" && state.runtime?.runs[m.id]
        ? [state.runtime.runs[m.id].elapsedMs]
        : [],
    );
    return {
      agentId,
      assignedMissions: missions.length,
      completedMissions: missions.filter((m) => m.status === "COMPLETED")
        .length,
      failedMissions: missions.filter((m) => m.status === "FAILED").length,
      blockedMissions: missions.filter((m) => m.status === "BLOCKED").length,
      approvalRejectionRate: decisions.length
        ? decisions.filter((a) => a.status === "REJECTED").length /
          decisions.length
        : null,
      reviewPassRate: reviews.length
        ? reviews.filter((r) => r.verdict === "PASS").length / reviews.length
        : null,
      averageLatencyMs: latency.length
        ? latency.reduce((a, b) => a + b, 0) / latency.length
        : null,
      attributedRevenueYen: contributions.byAgent[agentId] ?? 0,
    };
  });
}
