import { getSkillById } from "./registry";
import type { SkillExecutionResult } from "./types";
import { runPersonalCapture } from "./implementations/personalCapture";
import { runPersonalTodoAdd } from "./implementations/personalTodoAdd";
import { runPersonalTodayShow } from "./implementations/personalTodayShow";
import { runNoteDraftFormat } from "./implementations/noteDraftFormat";
import { runFundLogFormat } from "./implementations/fundLogFormat";

type Handler = (input: Record<string, unknown>) => {
  markdown: string;
  output?: Record<string, unknown>;
  warnings?: string[];
};

const HANDLERS: Readonly<Record<string, Handler>> = {
  "personal-capture": runPersonalCapture,
  "personal-todo-add": runPersonalTodoAdd,
  "personal-today-show": runPersonalTodayShow,
  "note-draft-format": runNoteDraftFormat,
  "fund-log-format": runFundLogFormat,
};

function safeInput(skillId: string, objective: string, context: string): Record<string, unknown> {
  const boundedContext = context.slice(-20_000);
  switch (skillId) {
    case "personal-capture": return { content: boundedContext || objective, source: "mission-runtime" };
    case "personal-todo-add": return { task: objective, memo: boundedContext };
    case "personal-today-show": return {};
    case "note-draft-format": return { title: objective, theme: objective, bodyMemo: boundedContext };
    case "fund-log-format": return { reason: boundedContext, memo: "Analysis only; no trade is authorized." };
    default: return {};
  }
}

/** Pure internal Skill boundary: no credentials, files, tools, capture, or external actions. */
export async function executeMissionSkill(input: {
  skillId: string;
  agentId: string;
  agentSkillIds: string[];
  objective: string;
  context: string;
}): Promise<SkillExecutionResult> {
  const base = { skillId: input.skillId, secretaryId: input.agentId };
  const definition = getSkillById(input.skillId);
  if (!definition) return { ...base, ok: false, error: "UNKNOWN_SKILL" };
  if (definition.status !== "implemented") return { ...base, ok: false, error: "SKILL_NOT_IMPLEMENTED" };
  if (!input.agentSkillIds.includes(input.skillId) || !definition.allowedSecretaries.includes(input.agentId))
    return { ...base, ok: false, error: "SKILL_NOT_AUTHORIZED" };
  const handler = HANDLERS[input.skillId];
  if (!handler) return { ...base, ok: false, error: "SKILL_HANDLER_NOT_REGISTERED" };
  try {
    const result = handler(safeInput(input.skillId, input.objective, input.context));
    if (!result.markdown.trim() || result.markdown.length > 50_000)
      return { ...base, ok: false, error: "INVALID_SKILL_OUTPUT" };
    return { ...base, ok: true, ...result };
  } catch {
    return { ...base, ok: false, error: "SKILL_EXECUTION_FAILED" };
  }
}
