/**
 * 会社の指標 — §13 CEO介入率 / §8 Proposal Score の元データ
 *
 * すべて決定論的な純関数。イベント配列を渡すだけで計算できるようにし、
 * 単体でテストできる形にしている（I/Oは eventStore 側）。
 */

import type { CompanyEvent } from "./events";

export type CompanyMetrics = {
  /** 対象期間の日数 */
  windowDays: number;
  totalEvents: number;
  /** 成功/失敗/スキップ */
  success: number;
  failure: number;
  skipped: number;

  /**
   * CEO介入率（§13）。人が手を入れたタスク ÷ 総タスク。
   * 承認そのものは介入に数えない（承認は設計上の関門であって手戻りではない）。
   * 目標は0%ではない。重要判断のHuman Approvalは維持する。
   */
  ceoInterventionRate: number;
  /** 自動化率。人の手が入らずに完了した割合 */
  automationRate: number;
  /** 失敗率 */
  failureRate: number;

  /** 測定できたイベントのみで平均を取る（測れないものを0で埋めない） */
  avgLatencyMs: number | null;
  totalCostUsd: number | null;

  /** 部門別の件数 */
  byDepartment: { department: string; events: number; interventionRate: number }[];
};

const windowStart = (days: number, now: Date): string =>
  new Date(now.getTime() - days * 86_400_000).toISOString();

export function eventsInWindow(
  events: CompanyEvent[],
  days: number,
  now: Date = new Date()
): CompanyEvent[] {
  const cutoff = windowStart(days, now);
  return events.filter((event) => event.at >= cutoff);
}

const rate = (numerator: number, denominator: number): number =>
  denominator > 0 ? Math.round((numerator / denominator) * 1000) / 10 : 0;

export function computeMetrics(
  events: CompanyEvent[],
  windowDays = 14,
  now: Date = new Date()
): CompanyMetrics {
  const scoped = eventsInWindow(events, windowDays, now);
  const total = scoped.length;

  const interventions = scoped.filter((e) => e.humanIntervention).length;
  const failure = scoped.filter((e) => e.outcome === "failure").length;
  const skipped = scoped.filter((e) => e.outcome === "skipped").length;

  const latencies = scoped
    .map((e) => e.latencyMs)
    .filter((v): v is number => typeof v === "number" && Number.isFinite(v));
  const costs = scoped
    .map((e) => e.costUsd)
    .filter((v): v is number => typeof v === "number" && Number.isFinite(v));

  const departments = [...new Set(scoped.map((e) => e.department))].map((department) => {
    const inDept = scoped.filter((e) => e.department === department);
    return {
      department,
      events: inDept.length,
      interventionRate: rate(inDept.filter((e) => e.humanIntervention).length, inDept.length),
    };
  });

  return {
    windowDays,
    totalEvents: total,
    success: scoped.filter((e) => e.outcome === "success").length,
    failure,
    skipped,
    ceoInterventionRate: rate(interventions, total),
    automationRate: rate(total - interventions, total),
    failureRate: rate(failure, total),
    avgLatencyMs:
      latencies.length > 0
        ? Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length)
        : null,
    totalCostUsd:
      costs.length > 0 ? Math.round(costs.reduce((a, b) => a + b, 0) * 10000) / 10000 : null,
    byDepartment: departments.sort((a, b) => b.events - a.events),
  };
}
