import type { CompanyEvent } from "../events";
import type { LearningEvent } from "../execution/runnerTypes";
export function learningToCompanyEvents(
  learning: LearningEvent[],
): CompanyEvent[] {
  return learning.map((e) => ({
    ...e,
    detail: [e.reason, e.originalProposal].filter(Boolean).join("; "),
    signature: `${e.actor}:${e.missionType ?? "mission"}:${e.actionType ?? e.type}`,
    tools: e.tools,
    action: e.reason === "NO_SUITABLE_AGENT" ? "NO_SUITABLE_AGENT" : e.action,
  }));
}

import type { Pattern } from "./detection/types";
import { defaultThresholds } from "./thresholds";
/** Additional evidence only; the existing proposal/CEO pipeline still owns changes. */
export function learningEvidencePatterns(
  events: LearningEvent[],
  now = new Date(),
): Pattern[] {
  const thresholds = defaultThresholds();
  const cutoff = new Date(
    now.getTime() - thresholds.windowDays * 86400000,
  ).toISOString();
  const missing = events.filter(
    (e) =>
      e.type === "MISSION_BLOCKED" &&
      e.reason === "NO_SUITABLE_AGENT" &&
      e.at >= cutoff,
  );
  const count = new Set(missing.map((e) => e.missionId).filter(Boolean)).size;
  if (count < thresholds.newAgent.minTasksInCategory) return [];
  return [
    {
      type: "NEW_AGENT_CANDIDATE",
      key: "NEW_AGENT_CANDIDATE:personal:unassigned",
      title: "担当できるAI社員がいないMissionが反復しています",
      target: { departmentId: "personal" },
      evidence: [
        {
          label: "NO_SUITABLE_AGENTになったMission",
          value: count,
          unit: "件",
          note: missing.map((e) => e.id).join(", "),
        },
      ],
      sampleSize: count,
      observationWindowDays: thresholds.windowDays,
      detectedAt: now.toISOString(),
    },
  ];
}
