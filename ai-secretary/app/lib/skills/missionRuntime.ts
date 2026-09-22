import { getSkillById } from "./registry";
import type { SkillExecutionResult } from "./types";
import { getSkillImplementation } from "./implementationRegistry";

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
  const implementation = getSkillImplementation(input.skillId);
  if (!implementation) return { ...base, ok: false, error: "SKILL_HANDLER_NOT_REGISTERED" };
  try {
    const result = implementation.run(implementation.buildMissionInput(input.objective, input.context));
    if (!result.markdown.trim() || result.markdown.length > 50_000)
      return { ...base, ok: false, error: "INVALID_SKILL_OUTPUT" };
    return { ...base, ok: true, ...result };
  } catch {
    return { ...base, ok: false, error: "SKILL_EXECUTION_FAILED" };
  }
}
