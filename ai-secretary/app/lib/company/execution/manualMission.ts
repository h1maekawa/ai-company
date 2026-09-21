import { randomUUID } from "node:crypto";
import type { ExecutionMission } from "./mission";

export const MANUAL_MISSION_TITLE_MAX = 120;
export const MANUAL_MISSION_DESCRIPTION_MAX = 2_000;

export type ManualMissionInput = { title?: unknown; description?: unknown };

export type ManualMissionValidation =
  | { ok: true; title: string; description: string }
  | { ok: false; error: "TITLE_REQUIRED" | "TITLE_TOO_LONG" | "DESCRIPTION_REQUIRED" | "DESCRIPTION_TOO_LONG" };

export function validateManualMissionInput(input: ManualMissionInput): ManualMissionValidation {
  const title = typeof input.title === "string" ? input.title.trim() : "";
  const description = typeof input.description === "string" ? input.description.trim() : "";
  if (!title) return { ok: false, error: "TITLE_REQUIRED" };
  if (title.length > MANUAL_MISSION_TITLE_MAX) return { ok: false, error: "TITLE_TOO_LONG" };
  if (!description) return { ok: false, error: "DESCRIPTION_REQUIRED" };
  if (description.length > MANUAL_MISSION_DESCRIPTION_MAX)
    return { ok: false, error: "DESCRIPTION_TOO_LONG" };
  return { ok: true, title, description };
}

export function createManualMissionRecord(
  input: { title: string; description: string; now?: Date; id?: string; routingContext?: ExecutionMission["routingContext"] },
): ExecutionMission {
  return {
    id: input.id ?? `mission_manual_${randomUUID()}`,
    category: "business",
    title: input.title,
    description: input.description,
    status: "PLANNED",
    source: "CEO_MANUAL",
    origin: "human",
    createdBy: "ceo",
    createdAt: (input.now ?? new Date()).toISOString(),
    version: 0,
    history: [],
    actionRequestIds: [],
    routingContext: input.routingContext,
  };
}
