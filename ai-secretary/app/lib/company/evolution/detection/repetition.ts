/**
 * 反復の検出 — v3.1 Phase 3 §3 / §6
 *
 * REPEATED_TASK / SKILL_CANDIDATE / WORKFLOW_CANDIDATE を担当する。
 *
 * 誤検知対策（§22）:
 *   - operation が "other"（分類できなかった）ものは反復として数えない。
 *     分類できていないものをまとめると、無関係な仕事が1つの候補に化ける
 *   - 既にSkillとして実装済みの処理は SKILL_CANDIDATE にしない
 *   - 同じ日にまとまって発生しただけのもの（単発プロジェクト）は
 *     「複数日にまたがる」ことを条件にして除く
 */

import {
  Detector,
  DetectorContext,
  Pattern,
  evidence,
  groupBy,
  withinWindow,
} from "./types";
import { isClassified, signatureKey, signatureKeyWithTools } from "../signature";
import type { CompanyEvent } from "../../events";
import type { TaskSignature } from "../signature";

/** 発生日の集合。単発プロジェクトと継続業務を分けるのに使う */
function distinctDays(events: CompanyEvent[]): number {
  return new Set(events.map((e) => e.at.slice(0, 10))).size;
}

type Grouped = { key: string; events: CompanyEvent[]; signature: TaskSignature };

/** signature ごとにイベントをまとめる。分類できなかったものは捨てる */
function groupBySignature(
  events: CompanyEvent[],
  signatures: Map<string, TaskSignature>,
  keyOf: (s: TaskSignature) => string
): Grouped[] {
  const withSig = events
    .map((event) => ({ event, signature: signatures.get(event.id) }))
    .filter((entry): entry is { event: CompanyEvent; signature: TaskSignature } =>
      Boolean(entry.signature) && isClassified(entry.signature as TaskSignature)
    );

  const grouped = groupBy(withSig, (entry) => keyOf(entry.signature));
  return [...grouped.entries()].map(([key, entries]) => ({
    key,
    events: entries.map((e) => e.event),
    signature: entries[0].signature,
  }));
}

export const repeatedTaskDetector: Detector = {
  id: "repeated-task",
  detects: ["REPEATED_TASK"],

  run({ events, signatures, thresholds, now }: DetectorContext): Pattern[] {
    const scoped = withinWindow(events, thresholds.windowDays, now);
    const groups = groupBySignature(scoped, signatures, signatureKey);

    return groups
      .filter((group) => group.events.length >= thresholds.repeatedTask.candidate)
      // 1日に固まっただけの作業は継続業務ではない（§22 単発Project対策）
      .filter((group) => distinctDays(group.events) >= 2)
      .map((group) => {
        const strong = group.events.length >= thresholds.repeatedTask.strong;
        return {
          type: "REPEATED_TASK" as const,
          key: `REPEATED_TASK:${group.key}`,
          title: `${group.signature.normalizedIntent} が${group.events.length}回発生`,
          target: {
            departmentId: group.signature.department,
            operation: group.signature.operation,
          },
          evidence: [
            evidence("発生回数", group.events.length, "件", `直近${thresholds.windowDays}日`),
            evidence("発生日数", distinctDays(group.events), "日", "1日に固まった作業を除くため"),
            evidence(
              "担当したAI社員数",
              new Set(group.events.map((e) => e.actor)).size,
              "人"
            ),
            evidence("強い候補か", strong ? 1 : 0, null, `${thresholds.repeatedTask.strong}回以上でstrong`),
          ],
          sampleSize: group.events.length,
          observationWindowDays: thresholds.windowDays,
          signature: group.signature,
          detectedAt: now.toISOString(),
        };
      });
  },
};

export const skillCandidateDetector: Detector = {
  id: "skill-candidate",
  detects: ["SKILL_CANDIDATE"],

  run({ events, signatures, organization, thresholds, now }: DetectorContext): Pattern[] {
    const scoped = withinWindow(events, thresholds.windowDays, now);
    const groups = groupBySignature(scoped, signatures, signatureKey);

    // 既にSkillとして存在する処理は候補にしない（§22 既存Skillで十分処理可能）
    const existingSkillIds = new Set(organization.agents.flatMap((a) => a.skillIds));

    return groups
      .filter((group) => !group.signature.operation.startsWith("skill:"))
      .filter((group) => !existingSkillIds.has(group.signature.operation))
      .filter((group) => group.events.length >= thresholds.skillCandidate.minOccurrences)
      .filter((group) => distinctDays(group.events) >= thresholds.skillCandidate.minDistinctTasks)
      .map((group) => ({
        type: "SKILL_CANDIDATE" as const,
        key: `SKILL_CANDIDATE:${group.key}`,
        title: `${group.signature.operation} をSkill化する候補`,
        target: {
          departmentId: group.signature.department,
          operation: group.signature.operation,
          skillId: group.signature.operation,
        },
        evidence: [
          evidence("同一処理の発生", group.events.length, "件", `直近${thresholds.windowDays}日`),
          evidence("発生日数", distinctDays(group.events), "日"),
          evidence(
            "手作業で処理された回数",
            group.events.filter((e) => !e.skillId).length,
            "件",
            "Skillが使われなかったもの"
          ),
        ],
        sampleSize: group.events.length,
        observationWindowDays: thresholds.windowDays,
        signature: group.signature,
        detectedAt: now.toISOString(),
      }));
  },
};

/**
 * Workflow候補。
 * 同じ実行順序（Skill/Agent/Toolの並び）が繰り返されているかを見る。
 * traceId でひとまとまりの仕事を復元し、その中の手順列を比較する。
 */
export const workflowCandidateDetector: Detector = {
  id: "workflow-candidate",
  detects: ["WORKFLOW_CANDIDATE"],

  run({ events, signatures, thresholds, now }: DetectorContext): Pattern[] {
    const scoped = withinWindow(events, thresholds.windowDays, now)
      .filter((event) => Boolean(event.traceId));

    const traces = groupBy(scoped, (event) => event.traceId as string);

    // 各traceを「手順の並び」に変換する
    const sequences = new Map<string, { steps: string[]; traceIds: string[]; department: string }>();
    for (const [traceId, traceEvents] of traces) {
      const ordered = [...traceEvents].sort((a, b) => a.at.localeCompare(b.at));
      const steps = ordered.map((event) => {
        const signature = signatures.get(event.id);
        return signature ? signature.operation : event.actor;
      });
      if (steps.length < thresholds.workflowCandidate.minSteps) continue;

      const key = steps.join(">");
      const existing = sequences.get(key);
      if (existing) existing.traceIds.push(traceId);
      else
        sequences.set(key, {
          steps,
          traceIds: [traceId],
          department: ordered[0].department || "unassigned",
        });
    }

    return [...sequences.entries()]
      .filter(([, seq]) => seq.traceIds.length >= thresholds.workflowCandidate.minSequences)
      .map(([key, seq]) => ({
        type: "WORKFLOW_CANDIDATE" as const,
        key: `WORKFLOW_CANDIDATE:${seq.department}:${key}`,
        title: `${seq.steps.join(" → ")} をWorkflow化する候補`,
        target: { departmentId: seq.department },
        evidence: [
          evidence("同じ手順の繰り返し", seq.traceIds.length, "回", `直近${thresholds.windowDays}日`),
          evidence("手順の長さ", seq.steps.length, "ステップ"),
        ],
        sampleSize: seq.traceIds.length,
        observationWindowDays: thresholds.windowDays,
        detectedAt: now.toISOString(),
      }));
  },
};

/** ツール列まで含めた同一性を見たい場合に使う（将来の拡張用に公開しておく） */
export { signatureKeyWithTools };
