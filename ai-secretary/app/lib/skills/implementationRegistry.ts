import { runPersonalCapture } from "./implementations/personalCapture";
import { runPersonalTodoAdd } from "./implementations/personalTodoAdd";
import { runPersonalTodayShow } from "./implementations/personalTodayShow";
import { runNoteDraftFormat } from "./implementations/noteDraftFormat";
import { runFundLogFormat } from "./implementations/fundLogFormat";
import { runCashflowTool } from "./implementations/cashflowTools";

export type SkillHandlerResult = { markdown: string; output?: Record<string, unknown>; warnings?: string[] };
export type SkillHandler = (input: Record<string, unknown>) => SkillHandlerResult | Promise<SkillHandlerResult>;
export type SkillImplementation = { skillId: string; run: SkillHandler; buildMissionInput: (objective: string, context: string) => Record<string, unknown> };

const bounded = (context: string) => context.slice(-20_000);
export const SKILL_IMPLEMENTATIONS: Readonly<Record<string, SkillImplementation>> = Object.freeze({
  "personal-capture": { skillId: "personal-capture", run: runPersonalCapture, buildMissionInput: (objective, context) => ({ content: bounded(context) || objective, source: "mission-runtime" }) },
  "personal-todo-add": { skillId: "personal-todo-add", run: runPersonalTodoAdd, buildMissionInput: (objective, context) => ({ task: objective, memo: bounded(context) }) },
  "personal-today-show": { skillId: "personal-today-show", run: runPersonalTodayShow, buildMissionInput: () => ({}) },
  "note-draft-format": { skillId: "note-draft-format", run: runNoteDraftFormat, buildMissionInput: (objective, context) => ({ title: objective, theme: objective, bodyMemo: bounded(context) }) },
  "fund-log-format": { skillId: "fund-log-format", run: runFundLogFormat, buildMissionInput: (_objective, context) => ({ reason: bounded(context), memo: "Analysis only; no trade is authorized." }) },
  "get_cashflow_summary": { skillId: "get_cashflow_summary", run: (input) => runCashflowTool("get_cashflow_summary", input), buildMissionInput: () => ({}) },
  "get_cashflow_week_detail": { skillId: "get_cashflow_week_detail", run: (input) => runCashflowTool("get_cashflow_week_detail", input), buildMissionInput: (objective) => ({ weekNumber: Number(objective.match(/\d+/)?.[0] ?? 1) }) },
  "get_cashflow_alerts": { skillId: "get_cashflow_alerts", run: (input) => runCashflowTool("get_cashflow_alerts", input), buildMissionInput: () => ({}) },
  "simulate_cashflow_scenario": { skillId: "simulate_cashflow_scenario", run: (input) => runCashflowTool("simulate_cashflow_scenario", input), buildMissionInput: (_objective, context) => ({ context }) },
});

export const getSkillImplementation = (skillId: string) => SKILL_IMPLEMENTATIONS[skillId];
