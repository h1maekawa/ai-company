/**
 * Bottleneck Analyzer — v3.1 Phase 3 §8
 *
 * Pattern Analyzer とは責務を分ける。
 * あちらは「こういう仕事が繰り返されている」という観測、
 * こちらは「どこが詰まっているか」という負荷の測定。
 *
 * 提案は作らない。数字を出すところまでが仕事。
 * 測定できなかった項目は null を返す（0で埋めると「速い」「安い」と誤読される）。
 */

import { groupBy, pct, ratio, withinWindow } from "./detection/types";
import { unnecessaryCorrections } from "./detection/quality";
import { defaultThresholds, type EvolutionThresholds } from "./thresholds";
import { buildOrganizationSnapshot, type OrganizationSnapshot } from "../organization";
import type { CompanyEvent } from "../events";

export type AgentLoad = {
  agentId: string;
  tasks: number;
  /** 全体に占める割合（%） */
  sharePct: number;
  failureRatePct: number;
  retryRatePct: number | null;
  /** 本来不要な人の修正率（%）。承認と R3/R4 は除く */
  correctionRatePct: number;
  avgLatencyMs: number | null;
  /** 全体平均に対する倍率。測れなければ null */
  latencyVsAverage: number | null;
  costUsd: number | null;
  /** しきい値を超えた項目 */
  flags: string[];
};

export type BottleneckReport = {
  status: "OK" | "INSUFFICIENT_DATA";
  reason?: string;
  windowDays: number;
  totalTasks: number;
  overallAvgLatencyMs: number | null;
  overallFailureRatePct: number;
  agents: AgentLoad[];
  /** Skillごとの集中度 */
  skills: { skillId: string; tasks: number; sharePct: number }[];
  analyzedAt: string;
};

const avgLatency = (events: CompanyEvent[]): number | null => {
  const values = events
    .map((e) => e.latencyMs)
    .filter((v): v is number => typeof v === "number" && Number.isFinite(v));
  return values.length > 0 ? Math.round(values.reduce((a, b) => a + b, 0) / values.length) : null;
};

const sumCost = (events: CompanyEvent[]): number | null => {
  const values = events
    .map((e) => e.costUsd)
    .filter((v): v is number => typeof v === "number" && Number.isFinite(v));
  return values.length > 0 ? Math.round(values.reduce((a, b) => a + b, 0) * 10000) / 10000 : null;
};

const retryRate = (events: CompanyEvent[]): number | null => {
  const measured = events.filter((e) => typeof e.retries === "number");
  if (measured.length === 0) return null;
  return ratio(measured.filter((e) => (e.retries ?? 0) > 0).length, measured.length);
};

export function analyzeBottlenecks(
  events: CompanyEvent[],
  options: {
    thresholds?: EvolutionThresholds;
    organization?: OrganizationSnapshot;
    now?: Date;
  } = {}
): BottleneckReport {
  const now = options.now ?? new Date();
  const thresholds = options.thresholds ?? defaultThresholds();
  const organization = options.organization ?? buildOrganizationSnapshot(now);
  const analyzedAt = now.toISOString();

  const scoped = withinWindow(events, thresholds.windowDays, now);

  if (scoped.length < thresholds.minimumEventsForAnalysis) {
    return {
      status: "INSUFFICIENT_DATA",
      reason: `窓内のイベントが${scoped.length}件しかありません`,
      windowDays: thresholds.windowDays,
      totalTasks: scoped.length,
      overallAvgLatencyMs: null,
      overallFailureRatePct: 0,
      agents: [],
      skills: [],
      analyzedAt,
    };
  }

  const overallLatency = avgLatency(scoped);
  const byAgent = groupBy(scoped, (event) => event.actor);

  const agents: AgentLoad[] = [...byAgent.entries()]
    .map(([agentId, agentEvents]) => {
      const failures = agentEvents.filter((e) => e.outcome === "failure").length;
      const corrections = unnecessaryCorrections(agentEvents, organization).length;
      const latency = avgLatency(agentEvents);
      const retries = retryRate(agentEvents);
      const share = ratio(agentEvents.length, scoped.length);

      const flags: string[] = [];
      if (share >= thresholds.bottleneck.concentrationShare) flags.push("タスク集中");
      if (ratio(failures, agentEvents.length) >= thresholds.bottleneck.failureRate)
        flags.push("失敗率");
      if (retries !== null && retries >= thresholds.bottleneck.retryRate) flags.push("再試行率");
      if (
        latency !== null &&
        overallLatency !== null &&
        overallLatency > 0 &&
        latency / overallLatency >= thresholds.bottleneck.latencyMultiplier
      ) {
        flags.push("処理時間");
      }
      if (ratio(corrections, agentEvents.length) >= thresholds.humanIntervention.highRate)
        flags.push("人の修正");

      return {
        agentId,
        tasks: agentEvents.length,
        sharePct: pct(share),
        failureRatePct: pct(ratio(failures, agentEvents.length)),
        retryRatePct: retries === null ? null : pct(retries),
        correctionRatePct: pct(ratio(corrections, agentEvents.length)),
        avgLatencyMs: latency,
        latencyVsAverage:
          latency !== null && overallLatency !== null && overallLatency > 0
            ? Math.round((latency / overallLatency) * 100) / 100
            : null,
        costUsd: sumCost(agentEvents),
        flags,
      };
    })
    .sort((a, b) => b.tasks - a.tasks);

  const bySkill = groupBy(
    scoped.filter((e) => e.skillId),
    (event) => event.skillId as string
  );

  return {
    status: "OK",
    windowDays: thresholds.windowDays,
    totalTasks: scoped.length,
    overallAvgLatencyMs: overallLatency,
    overallFailureRatePct: pct(
      ratio(scoped.filter((e) => e.outcome === "failure").length, scoped.length)
    ),
    agents,
    skills: [...bySkill.entries()]
      .map(([skillId, skillEvents]) => ({
        skillId,
        tasks: skillEvents.length,
        sharePct: pct(ratio(skillEvents.length, scoped.length)),
      }))
      .sort((a, b) => b.tasks - a.tasks),
    analyzedAt,
  };
}
