import { createHash } from "node:crypto";
import type { SkillCategory, SkillDefinition } from "../../skills/types";
import type { ExecutionState } from "../execution/store";
import { creatorSkillOpportunity } from "../execution/creatorWorkflow";

export type KnowledgeUsageType = "research" | "analysis" | "generation" | "review";
export type KnowledgeUsageEvent = {
  id: string; knowledgeId: string; missionId: string; missionTitle: string; planId: string; stepId: string;
  agentId: string; departmentId?: string; skillId?: string; usageType: KnowledgeUsageType; usedAt: string;
};
export type KnowledgeUsageSummary = { status: "CONFIRMED" | "UNKNOWN"; count: number | null; agents: string[]; missions: Array<{ id: string; title: string; agentId: string; usedAt: string }>; lastUsedAt: string | null };
export type SkillCandidateStatus = "PROPOSED" | "APPROVED" | "REJECTED" | "HOLD";
export type SkillCandidate = {
  id: string; patternSignature: string; name: string; purpose: string; departmentId?: string;
  sourceMissionIds: string[]; sourceKnowledgeIds: string[]; repeatedSteps: string[]; usageCount: number;
  suggestedAgents: string[]; suggestedCategory: SkillCategory; inputDescription: string; outputDescription: string;
  reason: string; existingSimilarSkillIds: string[]; status: SkillCandidateStatus;
  createdAt: string; updatedAt: string; lastObservedAt: string;
  decision?: { decision: "APPROVED" | "REJECTED" | "HOLD"; actor: "ceo"; decidedAt: string; reason?: string };
  executable: false; engineeringRequestAllowed: false; registryMutationAllowed: false;
};

const hash = (value: string) => createHash("sha256").update(value).digest("hex").slice(0, 20);
const refType = (value: string) => value.split(":", 1)[0] || "unknown";
const usageType = (type: string): KnowledgeUsageType => type === "generate" ? "generation" : type === "research" ? "research" : type === "review" ? "review" : "analysis";
const safeKnowledgeReference = (value: string) => value.length <= 240 && !/(?:api[_-]?key|secret|password|bearer\s|token=|sk-[a-z0-9])/iu.test(value);

/** Completed StepHistory is the usage fact. Plan search hits alone never enter this projection. */
export function deriveKnowledgeUsage(state: ExecutionState): KnowledgeUsageEvent[] {
  const events = new Map<string, KnowledgeUsageEvent>();
  for (const [missionId, run] of Object.entries(state.runtime?.runs ?? {})) {
    const mission = state.missions.find((item) => item.id === missionId);
    for (const history of run.history) {
      if (history.status !== "COMPLETE" || !history.agentId || !history.knowledgeRefs?.length) continue;
      const plan = state.plans.find((item) => item.id === history.planId);
      const step = plan?.steps.find((item) => item.id === history.stepId);
      if (!plan || !step) continue;
      for (const knowledgeId of history.knowledgeRefs) {
        if (!safeKnowledgeReference(knowledgeId)) continue;
        const fingerprint = `${missionId}:${history.stepId}:${knowledgeId}:${history.agentId}`;
        if (events.has(fingerprint)) continue;
        events.set(fingerprint, { id: `knowledge_usage_${hash(fingerprint)}`, knowledgeId, missionId, missionTitle: mission?.title ?? missionId, planId: plan.id, stepId: step.id, agentId: history.agentId, departmentId: plan.departmentId, skillId: step.requiredSkillId, usageType: usageType(step.type), usedAt: history.at });
      }
    }
  }
  return [...events.values()].sort((a, b) => b.usedAt.localeCompare(a.usedAt));
}

export function summarizeKnowledgeUsage(events: KnowledgeUsageEvent[] | null, knowledgeId: string): KnowledgeUsageSummary {
  if (!events) return { status: "UNKNOWN", count: null, agents: [], missions: [], lastUsedAt: null };
  const matching = events.filter((event) => event.knowledgeId === knowledgeId);
  return { status: "CONFIRMED", count: matching.length, agents: [...new Set(matching.map((event) => event.agentId))], missions: matching.map((event) => ({ id: event.missionId, title: event.missionTitle, agentId: event.agentId, usedAt: event.usedAt })), lastUsedAt: matching[0]?.usedAt ?? null };
}

type Observation = { signature: string; missionId: string; stepId: string; agentId: string; knowledgeIds: string[]; departmentId?: string; category: SkillCategory; input: string; output: string };
export function normalizedPatternSignature(input: { departmentId?: string; stepType: string; agentId: string; knowledgeDomains?: string[]; requiredSkillId?: string; inputRefs?: string[]; outputRefs?: string[] }) {
  return [input.departmentId ?? "unknown", input.stepType, input.agentId, [...new Set(input.knowledgeDomains ?? ["UNKNOWN"])].sort().join(","), input.requiredSkillId ?? "none", [...new Set((input.inputRefs ?? []).map(refType))].sort().join(","), [...new Set((input.outputRefs ?? []).map(refType))].sort().join(",")].join("|");
}

function observations(state: ExecutionState): Observation[] {
  const usage = deriveKnowledgeUsage(state);
  return state.plans.filter((plan) => plan.workflowKind === "CREATOR_MULTI_AGENT").flatMap((plan) => plan.steps.flatMap((step) => {
    const evidence = usage.filter((event) => event.planId === plan.id && event.stepId === step.id);
    if (!evidence.length) return [];
    const agentId = step.assignedAgentId ?? plan.agentId;
    return [{ signature: normalizedPatternSignature({ departmentId: plan.departmentId, stepType: step.type, agentId, requiredSkillId: step.requiredSkillId, inputRefs: step.inputRefs, outputRefs: step.outputRefs }), missionId: plan.missionId, stepId: step.id, agentId, knowledgeIds: evidence.map((event) => event.knowledgeId), departmentId: plan.departmentId, category: step.type === "research" ? "research" : step.type === "generate" ? "generation" : "format", input: [...new Set((step.inputRefs ?? []).map(refType))].join(", ") || "Mission context", output: [...new Set((step.outputRefs ?? []).map(refType))].join(", ") || "Auditable workflow result" }];
  }));
}

function similarSkills(group: Observation[], skills: SkillDefinition[]) {
  const steps = new Set(group.map((item) => item.stepId));
  const required = new Set(group.map((item) => item.signature.split("|")[4]).filter((id) => id !== "none"));
  if (steps.has("creator_kpi")) required.add("content-kpi-analysis");
  return skills.filter((skill) => required.has(skill.id)).map((skill) => skill.id);
}

export function discoverSkillCandidates(state: ExecutionState, skills: SkillDefinition[], now = new Date()): SkillCandidate[] {
  const grouped = new Map<string, Observation[]>();
  for (const observation of observations(state)) grouped.set(observation.signature, [...(grouped.get(observation.signature) ?? []), observation]);
  const candidates = [...(state.skillCandidates ?? [])];
  for (const [signature, raw] of grouped) {
    const missionIds = [...new Set(raw.map((item) => item.missionId))];
    const opportunity = creatorSkillOpportunity({ missionIds, repeatedSteps: raw.map((item) => item.stepId), knowledgeIds: raw.flatMap((item) => item.knowledgeIds), suggestedAgents: raw.map((item) => item.agentId) });
    if (!opportunity) continue;
    const matches = similarSkills(raw, skills);
    if (matches.length) continue;
    const id = `skill_candidate_${hash(signature)}`;
    const existing = candidates.find((item) => item.id === id);
    const observedAt = now.toISOString();
    const evidence = { sourceMissionIds: opportunity.sourceMissionIds, sourceKnowledgeIds: opportunity.sourceKnowledgeIds, repeatedSteps: opportunity.repeatedSteps, usageCount: opportunity.usageCount, suggestedAgents: opportunity.suggestedAgents };
    if (existing) {
      Object.assign(existing, evidence, { updatedAt: observedAt, lastObservedAt: observedAt });
      continue;
    }
    const first = raw[0];
    candidates.push({ id, patternSignature: signature, name: `${first.agentId}-${first.stepId}`.replace(/_/g, "-").toLowerCase(), purpose: `${first.stepId}で反復しているKnowledge利用を再現可能な仕様にする`, departmentId: first.departmentId, ...evidence, suggestedCategory: first.category, inputDescription: first.input, outputDescription: first.output, reason: opportunity.reason, existingSimilarSkillIds: [], status: "PROPOSED", createdAt: observedAt, updatedAt: observedAt, lastObservedAt: observedAt, executable: false, engineeringRequestAllowed: false, registryMutationAllowed: false });
  }
  return candidates;
}

export function decideSkillCandidate(candidate: SkillCandidate, decision: "APPROVED" | "REJECTED" | "HOLD", reason: string | undefined, now = new Date()): SkillCandidate {
  if (candidate.status !== "PROPOSED") throw new Error("CANDIDATE_ALREADY_DECIDED");
  if (decision === "REJECTED" && !reason?.trim()) throw new Error("REJECTION_REASON_REQUIRED");
  const decidedAt = now.toISOString();
  return { ...candidate, status: decision, updatedAt: decidedAt, decision: { decision, actor: "ceo", decidedAt, reason: reason?.trim() }, executable: false, engineeringRequestAllowed: false, registryMutationAllowed: false };
}
