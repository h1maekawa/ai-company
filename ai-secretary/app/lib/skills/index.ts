/**
 * Skills module — barrel export.
 *
 * 使い方の例:
 *   import { listSkills, getSkillsForSecretary, executeSkill } from "@/app/lib/skills";
 */
export type {
  SkillDefinition,
  SkillCategory,
  SkillExecutionInput,
  SkillExecutionResult,
} from "./types";
export {
  SKILL_REGISTRY,
  getSkillById,
  getSkillsForSecretary,
  listSkills,
  getSkillsByCategory,
} from "./registry";
export { executeSkill } from "./executor";
