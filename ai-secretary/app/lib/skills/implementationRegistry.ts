import { runPersonalCapture } from "./implementations/personalCapture";
import { runPersonalTodoAdd } from "./implementations/personalTodoAdd";
import { runPersonalTodayShow } from "./implementations/personalTodayShow";
import { runNoteDraftFormat } from "./implementations/noteDraftFormat";
import { runFundLogFormat } from "./implementations/fundLogFormat";

export type SkillHandlerResult = { markdown: string; output?: Record<string, unknown>; warnings?: string[] };
export type SkillHandler = (input: Record<string, unknown>) => SkillHandlerResult;
export type SkillImplementation = { skillId: string; run: SkillHandler; buildMissionInput: (objective: string, context: string) => Record<string, unknown> };

const bounded = (context: string) => context.slice(-20_000);
export const SKILL_IMPLEMENTATIONS: Readonly<Record<string, SkillImplementation>> = Object.freeze({
  "personal-capture": { skillId: "personal-capture", run: runPersonalCapture, buildMissionInput: (objective, context) => ({ content: bounded(context) || objective, source: "mission-runtime" }) },
  "personal-todo-add": { skillId: "personal-todo-add", run: runPersonalTodoAdd, buildMissionInput: (objective, context) => ({ task: objective, memo: bounded(context) }) },
  "personal-today-show": { skillId: "personal-today-show", run: runPersonalTodayShow, buildMissionInput: () => ({}) },
  "note-draft-format": { skillId: "note-draft-format", run: runNoteDraftFormat, buildMissionInput: (objective, context) => ({ title: objective, theme: objective, bodyMemo: bounded(context) }) },
  "fund-log-format": { skillId: "fund-log-format", run: runFundLogFormat, buildMissionInput: (_objective, context) => ({ reason: bounded(context), memo: "Analysis only; no trade is authorized." }) },
});

export const getSkillImplementation = (skillId: string) => SKILL_IMPLEMENTATIONS[skillId];
