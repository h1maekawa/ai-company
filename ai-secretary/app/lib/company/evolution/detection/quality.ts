/**
 * 品質・負荷の検出 — v3.1 Phase 3 §3 / §7
 *
 * HIGH_HUMAN_INTERVENTION / HIGH_FAILURE_RATE / HIGH_RETRY_RATE / HIGH_API_COST。
 *
 * §7 の肝:
 *   「本来不要な人間修正」と「Governance上必須のApproval」を分離する。
 *   R3（毎回承認）のAI社員は、承認が入ること自体が仕様どおりであり、
 *   これを介入率の悪化として扱うと、指標を良くしようとする力が
 *   承認を外す方向に働いてしまう。
 *
 *   Phase 1 の humanIntervention は既に「承認そのもの」を除いてあるが、
 *   ここではさらにAI社員のリスク区分を見て、R3の承認由来を確実に除く。
 */

import {
  Detector,
  DetectorContext,
  Pattern,
  evidence,
  groupBy,
  pct,
  ratio,
  withinWindow,
} from "./types";
import type { CompanyEvent } from "../../events";
import type { OrganizationSnapshot } from "../../organization";

/** 承認系のイベント種別。仕様上の関門であって手戻りではない */
const APPROVAL_KINDS = new Set([
  "approval.requested",
  "approval.approved",
  "review.decision",
]);

/**
 * 「本来不要な人間修正」だけを数える。
 *
 * 除くもの:
 *   - 承認系イベント（関門であって手戻りではない）
 *   - R3 / R4 のAI社員のイベント（人の関与が仕様）
 */
export function unnecessaryCorrections(
  events: CompanyEvent[],
  organization: OrganizationSnapshot
): CompanyEvent[] {
  const mandated = new Set(
    organization.agents
      .filter((agent) => agent.riskLevel === "R3" || agent.riskLevel === "R4")
      .map((agent) => agent.id)
  );

  return events.filter(
    (event) =>
      event.humanIntervention &&
      !APPROVAL_KINDS.has(event.kind) &&
      !mandated.has(event.actor)
  );
}

export const humanInterventionDetector: Detector = {
  id: "high-human-intervention",
  detects: ["HIGH_HUMAN_INTERVENTION"],

  run({ events, organization, thresholds, now }: DetectorContext): Pattern[] {
    const scoped = withinWindow(events, thresholds.windowDays, now);
    const byAgent = groupBy(scoped, (event) => event.actor);
    const mandated = new Map(organization.agents.map((a) => [a.id, a.riskLevel]));

    return [...byAgent.entries()]
      .map(([agentId, agentEvents]) => {
        const completed = agentEvents.filter((e) => e.outcome !== "skipped");
        const corrections = unnecessaryCorrections(agentEvents, organization);
        return { agentId, agentEvents, completed, corrections };
      })
      // 分母が小さいと率が暴れるため、最小件数を満たすものだけ見る
      .filter(({ completed }) => completed.length >= thresholds.humanIntervention.minCompletedTasks)
      .filter(
        ({ corrections, completed }) =>
          ratio(corrections.length, completed.length) >= thresholds.humanIntervention.highRate
      )
      .map(({ agentId, completed, corrections }) => ({
        type: "HIGH_HUMAN_INTERVENTION" as const,
        key: `HIGH_HUMAN_INTERVENTION:${agentId}`,
        title: `${agentId} で人の修正が多い`,
        target: { agentId },
        evidence: [
          evidence("本来不要な修正", corrections.length, "件", "承認と R3/R4 の関与は除外済み"),
          evidence("完了タスク", completed.length, "件", `直近${thresholds.windowDays}日`),
          evidence("修正率", pct(ratio(corrections.length, completed.length)), "%"),
          evidence(
            "リスク区分",
            0,
            null,
            `${mandated.get(agentId) ?? "不明"}（R3/R4は承認が仕様のため対象外）`
          ),
        ],
        sampleSize: completed.length,
        observationWindowDays: thresholds.windowDays,
        detectedAt: now.toISOString(),
      }));
  },
};

export const failureRateDetector: Detector = {
  id: "high-failure-rate",
  detects: ["HIGH_FAILURE_RATE"],

  run({ events, thresholds, now }: DetectorContext): Pattern[] {
    const scoped = withinWindow(events, thresholds.windowDays, now);
    const byAgent = groupBy(scoped, (event) => event.actor);

    return [...byAgent.entries()]
      .map(([agentId, agentEvents]) => ({
        agentId,
        agentEvents,
        failures: agentEvents.filter((e) => e.outcome === "failure"),
      }))
      .filter(({ agentEvents }) => agentEvents.length >= thresholds.minimumSampleSize)
      .filter(
        ({ failures, agentEvents }) =>
          ratio(failures.length, agentEvents.length) >= thresholds.bottleneck.failureRate
      )
      .map(({ agentId, agentEvents, failures }) => ({
        type: "HIGH_FAILURE_RATE" as const,
        key: `HIGH_FAILURE_RATE:${agentId}`,
        title: `${agentId} の失敗率が高い`,
        target: { agentId },
        evidence: [
          evidence("失敗", failures.length, "件"),
          evidence("総タスク", agentEvents.length, "件", `直近${thresholds.windowDays}日`),
          evidence("失敗率", pct(ratio(failures.length, agentEvents.length)), "%"),
          ...[...new Set(failures.map((f) => f.detail).filter(Boolean))]
            .slice(0, 3)
            .map((detail, index) => evidence(`失敗理由${index + 1}`, 0, null, String(detail))),
        ],
        sampleSize: agentEvents.length,
        observationWindowDays: thresholds.windowDays,
        detectedAt: now.toISOString(),
      }));
  },
};

export const retryRateDetector: Detector = {
  id: "high-retry-rate",
  detects: ["HIGH_RETRY_RATE"],

  run({ events, thresholds, now }: DetectorContext): Pattern[] {
    const scoped = withinWindow(events, thresholds.windowDays, now);
    // retries が記録されているイベントだけを母数にする（未記録を0とみなさない）
    const measured = scoped.filter((e) => typeof e.retries === "number");
    if (measured.length < thresholds.minimumSampleSize) return [];

    const byAgent = groupBy(measured, (event) => event.actor);

    return [...byAgent.entries()]
      .map(([agentId, agentEvents]) => ({
        agentId,
        agentEvents,
        retried: agentEvents.filter((e) => (e.retries ?? 0) > 0),
      }))
      .filter(({ agentEvents }) => agentEvents.length >= thresholds.minimumSampleSize)
      .filter(
        ({ retried, agentEvents }) =>
          ratio(retried.length, agentEvents.length) >= thresholds.bottleneck.retryRate
      )
      .map(({ agentId, agentEvents, retried }) => ({
        type: "HIGH_RETRY_RATE" as const,
        key: `HIGH_RETRY_RATE:${agentId}`,
        title: `${agentId} の再試行が多い`,
        target: { agentId },
        evidence: [
          evidence("再試行があったタスク", retried.length, "件"),
          evidence("計測できたタスク", agentEvents.length, "件", "retriesが記録されたものだけ"),
          evidence("再試行率", pct(ratio(retried.length, agentEvents.length)), "%"),
        ],
        sampleSize: agentEvents.length,
        observationWindowDays: thresholds.windowDays,
        detectedAt: now.toISOString(),
      }));
  },
};

export const apiCostDetector: Detector = {
  id: "high-api-cost",
  detects: ["HIGH_API_COST"],

  run({ events, thresholds, now }: DetectorContext): Pattern[] {
    const scoped = withinWindow(events, thresholds.windowDays, now);
    const byAgent = groupBy(
      scoped.filter((e) => typeof e.costUsd === "number"),
      (event) => event.actor
    );

    return [...byAgent.entries()]
      .map(([agentId, agentEvents]) => ({
        agentId,
        agentEvents,
        cost: agentEvents.reduce((sum, e) => sum + (e.costUsd ?? 0), 0),
      }))
      .filter(({ cost }) => cost >= thresholds.bottleneck.apiCostUsd)
      .map(({ agentId, agentEvents, cost }) => ({
        type: "HIGH_API_COST" as const,
        key: `HIGH_API_COST:${agentId}`,
        title: `${agentId} のAPIコストが大きい`,
        target: { agentId },
        evidence: [
          evidence("コスト", Math.round(cost * 100) / 100, "USD", `直近${thresholds.windowDays}日`),
          evidence("計測できたタスク", agentEvents.length, "件"),
          evidence(
            "1タスクあたり",
            Math.round((cost / Math.max(1, agentEvents.length)) * 10000) / 10000,
            "USD"
          ),
        ],
        sampleSize: agentEvents.length,
        observationWindowDays: thresholds.windowDays,
        detectedAt: now.toISOString(),
      }));
  },
};
