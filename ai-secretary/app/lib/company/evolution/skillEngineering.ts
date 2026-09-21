import { createHash } from "node:crypto";
import type { SkillCategory, SkillDefinition } from "../../skills/types";
import type { SkillCandidate } from "./skillCandidates";
import { getSecretaryById } from "../../config/departments";

export type SkillSpecificationStatus = "READY_FOR_HUMAN_REVIEW" | "APPROVED_FOR_ENGINEERING" | "REJECTED";
export type SkillEngineeringSpecification = {
  id: string;
  skillCandidateId: string;
  proposedSkillId: string;
  title: string;
  purpose: string;
  category: SkillCategory;
  allowedAgentIds: string[];
  sourceKnowledgeIds: string[];
  sourceMissionIds: string[];
  repeatedSteps: string[];
  usageCount: number;
  evidenceSummary: string;
  inputDescription: string;
  outputDescription: string;
  acceptanceCriteria: string[];
  requiredTests: string[];
  constraints: string[];
  existingSimilarSkillIds: string[];
  risk: "LOW" | "MEDIUM" | "HIGH" | "PROTECTED";
  status: SkillSpecificationStatus;
  createdAt: string;
  updatedAt: string;
  decision?: { actor: "ceo"; decision: "APPROVED_FOR_ENGINEERING" | "REJECTED"; decidedAt: string; reason?: string };
};

export type SkillEngineeringHandoff = {
  candidateId: string;
  specificationId: string;
  githubIssueNumber: number;
  githubIssueUrl: string;
  createdAt: string;
  aiReadyApprovedAt?: string;
  aiReadyApprovedBy?: "ceo";
  pullRequestNumber?: number;
  pullRequestUrl?: string;
  workerStatus?: string;
  implementedSkillId?: string;
  reconciledAt?: string;
};

const hash = (value: string) => createHash("sha256").update(value).digest("hex").slice(0, 20);
const kebab = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 80);

export function duplicateSkillIds(proposedSkillId: string, skills: SkillDefinition[]): string[] {
  const normalized = kebab(proposedSkillId);
  return skills.filter((skill) => kebab(skill.id) === normalized || kebab(skill.name) === normalized).map((skill) => skill.id);
}

export function createSkillEngineeringSpecification(candidate: SkillCandidate, skills: SkillDefinition[], now = new Date()): SkillEngineeringSpecification {
  if (candidate.status !== "APPROVED") throw new Error("APPROVED_CANDIDATE_REQUIRED");
  const proposedSkillId = kebab(candidate.name);
  const duplicates = duplicateSkillIds(proposedSkillId, skills);
  if (duplicates.length) throw new Error(`DUPLICATE_SKILL_DETECTED:${duplicates.join(",")}`);
  const unknownAgent = candidate.suggestedAgents.find((agentId) => !getSecretaryById(agentId));
  if (unknownAgent) throw new Error(`UNKNOWN_ALLOWED_AGENT:${unknownAgent}`);
  const timestamp = now.toISOString();
  return {
    id: `skill_specification_${hash(candidate.id)}`,
    skillCandidateId: candidate.id,
    proposedSkillId,
    title: candidate.name,
    purpose: candidate.purpose,
    category: candidate.suggestedCategory,
    allowedAgentIds: [...new Set(candidate.suggestedAgents)],
    sourceKnowledgeIds: [...candidate.sourceKnowledgeIds],
    sourceMissionIds: [...candidate.sourceMissionIds],
    repeatedSteps: [...candidate.repeatedSteps],
    usageCount: candidate.usageCount,
    evidenceSummary: `${candidate.usageCount} distinct Missionsで${candidate.repeatedSteps.join(", ")}が反復された`,
    inputDescription: candidate.inputDescription,
    outputDescription: candidate.outputDescription,
    acceptanceCriteria: ["入力から期待する出力を決定論的または監査可能に生成する", "既存Skill Runtimeへ統合し、失敗時は安全に停止する", "必要な自動テストがすべて成功する"],
    requiredTests: ["Skill executor unit test", "Allowed Agent authorization test", "Architecture safety invariant test"],
    constraints: ["Never weaken financial HUMAN_ONLY boundaries", "Never auto publish", "Never push main", "Never auto merge", "Never deploy production", "Never expose secrets"],
    existingSimilarSkillIds: [...candidate.existingSimilarSkillIds],
    risk: candidate.departmentId === "fund" ? "HIGH" : "MEDIUM",
    status: "READY_FOR_HUMAN_REVIEW",
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

export function decideSkillEngineeringSpecification(specification: SkillEngineeringSpecification, decision: "APPROVED_FOR_ENGINEERING" | "REJECTED", reason: string | undefined, now = new Date()): SkillEngineeringSpecification {
  if (specification.status !== "READY_FOR_HUMAN_REVIEW") throw new Error("SPECIFICATION_ALREADY_DECIDED");
  if (decision === "REJECTED" && !reason?.trim()) throw new Error("REJECTION_REASON_REQUIRED");
  const decidedAt = now.toISOString();
  return { ...specification, status: decision, updatedAt: decidedAt, decision: { actor: "ceo", decision, decidedAt, reason: reason?.trim() } };
}

export function assertSpecificationCanCreateIssue(specification: SkillEngineeringSpecification, skills: SkillDefinition[]) {
  if (specification.status !== "APPROVED_FOR_ENGINEERING" || specification.decision?.actor !== "ceo") throw new Error("HUMAN_SPECIFICATION_APPROVAL_REQUIRED");
  const duplicates = [...new Set([...specification.existingSimilarSkillIds, ...duplicateSkillIds(specification.proposedSkillId, skills)])];
  if (duplicates.length) throw new Error(`DUPLICATE_SKILL_DETECTED:${duplicates.join(",")}`);
}

export function skillIssueBody(specification: SkillEngineeringSpecification): string {
  const bullets = (items: string[]) => items.map((item) => `- ${item}`).join("\n");
  return `## Goal\n\n${specification.purpose}\n\n## Skill Candidate\n\n${specification.skillCandidateId}\n\n## Engineering Specification\n\n${specification.id}\n\n## Proposed Skill ID\n\n${specification.proposedSkillId}\n\n## Source Evidence\n\n- Mission IDs: ${specification.sourceMissionIds.join(", ")}\n- Knowledge IDs: ${specification.sourceKnowledgeIds.join(", ")}\n- Repeated Steps: ${specification.repeatedSteps.join(", ")}\n- Usage Count: ${specification.usageCount}\n\n## Input\n\n${specification.inputDescription}\n\n## Output\n\n${specification.outputDescription}\n\n## Allowed Agents\n\n${bullets(specification.allowedAgentIds)}\n\n## Acceptance Criteria\n\n${bullets(specification.acceptanceCriteria)}\n\n## Required Tests\n\n${bullets(specification.requiredTests)}\n\n## Constraints\n\n${bullets(specification.constraints)}\n\n## Human Approval\n\nEngineering specification approved by CEO.`;
}

export function reconcileSkillImplementation(handoff: SkillEngineeringHandoff, specification: SkillEngineeringSpecification, skills: SkillDefinition[], pullRequest: { number: number; url: string; merged: boolean } | null, now = new Date()): SkillEngineeringHandoff {
  const implemented = skills.find((skill) => skill.id === specification.proposedSkillId && skill.status === "implemented");
  if (!pullRequest) return handoff;
  if (!pullRequest.merged) return { ...handoff, pullRequestNumber: pullRequest.number, pullRequestUrl: pullRequest.url, workerStatus: "PR_READY" };
  if (!implemented) return { ...handoff, pullRequestNumber: pullRequest.number, pullRequestUrl: pullRequest.url, workerStatus: "BLOCKED" };
  return { ...handoff, pullRequestNumber: pullRequest.number, pullRequestUrl: pullRequest.url, workerStatus: "MERGED", implementedSkillId: implemented.id, reconciledAt: now.toISOString() };
}
