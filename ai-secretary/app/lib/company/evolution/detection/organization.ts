/**
 * 組織構成の検出 — v3.1 Phase 3 §3 / §6
 *
 * NEW_AGENT_CANDIDATE / AGENT_SPLIT_CANDIDATE / AGENT_MERGE_CANDIDATE /
 * NEW_DEPARTMENT_CANDIDATE を担当する。
 *
 * 組織を増やす提案は取り消しが効きにくいため、
 * 反復検出より厳しいしきい値と長い観測窓で判断する（§6）。
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
import { isClassified } from "../signature";
import type { CompanyEvent } from "../../events";
import type { TaskSignature } from "../signature";

type Tagged = { event: CompanyEvent; signature: TaskSignature };

function tag(events: CompanyEvent[], signatures: Map<string, TaskSignature>): Tagged[] {
  return events
    .map((event) => ({ event, signature: signatures.get(event.id) }))
    .filter((e): e is Tagged => Boolean(e.signature) && isClassified(e.signature as TaskSignature));
}

const correctionRate = (events: CompanyEvent[]): number =>
  ratio(events.filter((e) => e.humanIntervention).length, events.length);

const avgLatency = (events: CompanyEvent[]): number | null => {
  const values = events
    .map((e) => e.latencyMs)
    .filter((v): v is number => typeof v === "number" && Number.isFinite(v));
  return values.length > 0 ? Math.round(values.reduce((a, b) => a + b, 0) / values.length) : null;
};

/**
 * 新しいAI社員の候補。
 * 「ある専門カテゴリが、既存AI社員の業務を圧迫している」ことを根拠にする。
 */
export const newAgentDetector: Detector = {
  id: "new-agent-candidate",
  detects: ["NEW_AGENT_CANDIDATE"],

  run({ events, signatures, thresholds, now }: DetectorContext): Pattern[] {
    const scoped = tag(withinWindow(events, thresholds.windowDays, now), signatures);
    const byAgent = groupBy(scoped, (t) => t.event.actor);
    const patterns: Pattern[] = [];

    for (const [agentId, agentTasks] of byAgent) {
      const byOperation = groupBy(agentTasks, (t) => t.signature.operation);

      for (const [operation, opTasks] of byOperation) {
        const share = ratio(opTasks.length, agentTasks.length);
        const opEvents = opTasks.map((t) => t.event);
        const otherEvents = agentTasks
          .filter((t) => t.signature.operation !== operation)
          .map((t) => t.event);

        const enoughVolume = opTasks.length >= thresholds.newAgent.minTasksInCategory;
        const dominates = share >= thresholds.newAgent.minShareOfAgent;
        const correctionHeavy =
          correctionRate(opEvents) >= thresholds.newAgent.highCorrectionRate;

        // 量が足りたうえで「専有している」か「修正が多い」かのどちらかが要る
        if (!enoughVolume || !(dominates || correctionHeavy)) continue;

        const opLatency = avgLatency(opEvents);
        const otherLatency = avgLatency(otherEvents);

        patterns.push({
          type: "NEW_AGENT_CANDIDATE",
          key: `NEW_AGENT_CANDIDATE:${agentTasks[0].signature.department}:${operation}`,
          title: `${operation} 専任のAI社員を置く候補`,
          target: {
            departmentId: agentTasks[0].signature.department,
            agentId,
            operation,
          },
          evidence: [
            evidence(`${operation} のタスク数`, opTasks.length, "件", `直近${thresholds.windowDays}日`),
            evidence(`${agentId} の総タスク数`, agentTasks.length, "件"),
            evidence("そのAI社員に占める割合", pct(share), "%"),
            evidence(`${operation} の人の修正率`, pct(correctionRate(opEvents)), "%"),
            evidence("他業務の人の修正率", pct(correctionRate(otherEvents)), "%"),
            ...(opLatency !== null
              ? [evidence(`${operation} の平均処理時間`, Math.round(opLatency / 1000), "秒")]
              : []),
            ...(otherLatency !== null
              ? [evidence("他業務の平均処理時間", Math.round(otherLatency / 1000), "秒")]
              : []),
          ],
          sampleSize: opTasks.length,
          observationWindowDays: thresholds.windowDays,
          signature: opTasks[0].signature,
          detectedAt: now.toISOString(),
        });
      }
    }

    return patterns;
  },
};

/** 1人が異なる専門領域を抱えすぎている場合の分割候補 */
export const agentSplitDetector: Detector = {
  id: "agent-split-candidate",
  detects: ["AGENT_SPLIT_CANDIDATE"],

  run({ events, signatures, thresholds, now }: DetectorContext): Pattern[] {
    const scoped = tag(withinWindow(events, thresholds.windowDays, now), signatures);
    const byAgent = groupBy(scoped, (t) => t.event.actor);

    return [...byAgent.entries()]
      .map(([agentId, tasks]) => {
        const operations = [...new Set(tasks.map((t) => t.signature.operation))];
        return { agentId, tasks, operations };
      })
      .filter(
        ({ tasks, operations }) =>
          tasks.length >= thresholds.agentSplit.minTasks &&
          operations.length >= thresholds.agentSplit.minDistinctOperations
      )
      .map(({ agentId, tasks, operations }) => ({
        type: "AGENT_SPLIT_CANDIDATE" as const,
        key: `AGENT_SPLIT_CANDIDATE:${agentId}`,
        title: `${agentId} が${operations.length}種類の専門業務を抱えている`,
        target: { departmentId: tasks[0].signature.department, agentId },
        evidence: [
          evidence("抱えている専門領域", operations.length, "種類", operations.join(" / ")),
          evidence("総タスク数", tasks.length, "件", `直近${thresholds.windowDays}日`),
          evidence("人の修正率", pct(correctionRate(tasks.map((t) => t.event))), "%"),
        ],
        sampleSize: tasks.length,
        observationWindowDays: thresholds.windowDays,
        detectedAt: now.toISOString(),
      }));
  },
};

/**
 * ほとんど仕事が来ていないAI社員の統合候補。
 * 組織を増やす提案だけでなく、減らす提案も出せるようにしておく（§5）。
 */
export const agentMergeDetector: Detector = {
  id: "agent-merge-candidate",
  detects: ["AGENT_MERGE_CANDIDATE"],

  run({ events, organization, thresholds, now }: DetectorContext): Pattern[] {
    const scoped = withinWindow(events, thresholds.windowDays, now);
    const counts = groupBy(scoped, (event) => event.actor);

    return organization.agents
      .map((agent) => ({ agent, count: counts.get(agent.id)?.length ?? 0 }))
      // 管理職は仕事量で測る対象ではないので除く
      .filter(({ agent }) => agent.kind !== "manager")
      .filter(({ count }) => count <= thresholds.agentMerge.maxTasks)
      .map(({ agent, count }) => ({
        type: "AGENT_MERGE_CANDIDATE" as const,
        key: `AGENT_MERGE_CANDIDATE:${agent.id}`,
        title: `${agent.name} の稼働が少ない（統合の検討）`,
        target: { departmentId: agent.departmentId, agentId: agent.id },
        evidence: [
          evidence("タスク数", count, "件", `直近${thresholds.windowDays}日`),
          evidence("しきい値", thresholds.agentMerge.maxTasks, "件", "これ以下で候補"),
        ],
        // 「起きていないこと」が根拠なのでサンプル数は窓内の全体量で測る
        sampleSize: scoped.length,
        observationWindowDays: thresholds.windowDays,
        detectedAt: now.toISOString(),
      }));
  },
};

/**
 * 新部署の候補。
 * 最も重い提案なので、長い窓（既定30日）と複数条件で判断する。
 */
export const newDepartmentDetector: Detector = {
  id: "new-department-candidate",
  detects: ["NEW_DEPARTMENT_CANDIDATE"],

  run({ events, signatures, thresholds, now }: DetectorContext): Pattern[] {
    const scoped = tag(withinWindow(events, thresholds.departmentWindowDays, now), signatures);

    // ドメイン＝operation の接頭辞。medical_research / medical_* を同じ塊として見る
    const byDomain = groupBy(scoped, (t) => t.signature.operation.split("_")[0]);

    return [...byDomain.entries()]
      .map(([domain, tasks]) => {
        const agents = [...new Set(tasks.map((t) => t.event.actor))];
        const operations = [...new Set(tasks.map((t) => t.signature.operation))];
        return { domain, tasks, agents, operations };
      })
      .filter(
        ({ tasks, agents, domain }) =>
          domain !== "other" &&
          tasks.length >= thresholds.newDepartment.minTaskVolume &&
          agents.length >= thresholds.newDepartment.minAgentCandidates
      )
      .map(({ domain, tasks, agents, operations }) => ({
        type: "NEW_DEPARTMENT_CANDIDATE" as const,
        key: `NEW_DEPARTMENT_CANDIDATE:${domain}`,
        title: `${domain} 領域が部署化の規模に達している`,
        target: { operation: domain },
        evidence: [
          evidence("タスク量", tasks.length, "件", `直近${thresholds.departmentWindowDays}日`),
          evidence("関与したAI社員", agents.length, "人", agents.join(" / ")),
          evidence("業務の種類", operations.length, "種類", operations.join(" / ")),
        ],
        sampleSize: tasks.length,
        observationWindowDays: thresholds.departmentWindowDays,
        detectedAt: now.toISOString(),
      }));
  },
};
