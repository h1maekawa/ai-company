import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const subject = require(path.join(process.env.QA_DIST, "out/app/lib/company/evolution/skillEngineering.js"));

const candidate = (status = "APPROVED") => ({ id: "candidate-1", patternSignature: "creator|research", name: "market-research-brief", purpose: "市場調査を再現可能にする", departmentId: "creator", sourceMissionIds: ["mission-1", "mission-2", "mission-3"], sourceKnowledgeIds: ["knowledge-1"], repeatedSteps: ["market_brief"], usageCount: 3, suggestedAgents: ["creator-research"], suggestedCategory: "research", inputDescription: "Mission context", outputDescription: "Research brief", reason: "Repeated", existingSimilarSkillIds: [], status, createdAt: "2026-09-22T00:00:00Z", updatedAt: "2026-09-22T00:00:00Z", lastObservedAt: "2026-09-22T00:00:00Z", executable: false, engineeringRequestAllowed: false, registryMutationAllowed: false });

test("APPROVED Candidateだけがlineage付きSpecificationを作れる", () => {
  for (const status of ["PROPOSED", "REJECTED", "HOLD"]) assert.throws(() => subject.createSkillEngineeringSpecification(candidate(status), []), /APPROVED_CANDIDATE_REQUIRED/);
  const specification = subject.createSkillEngineeringSpecification(candidate(), [], new Date("2026-09-22T00:00:00Z"));
  assert.equal(specification.skillCandidateId, "candidate-1");
  assert.deepEqual(specification.sourceMissionIds, ["mission-1", "mission-2", "mission-3"]);
  assert.deepEqual(specification.sourceKnowledgeIds, ["knowledge-1"]);
  assert.deepEqual(specification.repeatedSteps, ["market_brief"]);
  assert.equal(specification.usageCount, 3);
});

test("Specification approvalはIssueやai-readyを生成せず、再度のHuman Gateを要求する", () => {
  const specification = subject.createSkillEngineeringSpecification(candidate(), []);
  assert.throws(() => subject.assertSpecificationCanCreateIssue(specification, []), /HUMAN_SPECIFICATION_APPROVAL_REQUIRED/);
  const approved = subject.decideSkillEngineeringSpecification(specification, "APPROVED_FOR_ENGINEERING", undefined);
  assert.equal(approved.decision.actor, "ceo");
  assert.doesNotMatch(JSON.stringify(approved), /githubIssue|aiReady/);
  assert.doesNotMatch(subject.skillIssueBody(approved), /sk-[a-z0-9]+|api[_-]?key\s*=/i);
});

test("Issue直前のRegistry再検査がplannedを含む重複Skillを停止する", () => {
  const specification = subject.decideSkillEngineeringSpecification(subject.createSkillEngineeringSpecification(candidate(), []), "APPROVED_FOR_ENGINEERING");
  const existing = { id: "market-research-brief", name: "Market Research Brief", description: "", category: "research", allowedSecretaries: [], inputSchemaDescription: "", outputSchemaDescription: "", status: "planned" };
  assert.throws(() => subject.assertSpecificationCanCreateIssue(specification, [existing]), /DUPLICATE_SKILL_DETECTED/);
});

test("mergeとimplemented Registry entryの両方だけがreconciledになる", () => {
  const specification = subject.decideSkillEngineeringSpecification(subject.createSkillEngineeringSpecification(candidate(), []), "APPROVED_FOR_ENGINEERING");
  const handoff = { candidateId: "candidate-1", specificationId: specification.id, githubIssueNumber: 123, githubIssueUrl: "https://example.test/123", createdAt: "2026-09-22T00:00:00Z" };
  const skill = { id: specification.proposedSkillId, name: "Skill", description: "", category: "research", allowedSecretaries: ["creator-research"], inputSchemaDescription: "", outputSchemaDescription: "", status: "implemented" };
  assert.equal(subject.reconcileSkillImplementation(handoff, specification, [], { number: 124, url: "https://example.test/pr/124", merged: true }).reconciledAt, undefined);
  assert.equal(subject.reconcileSkillImplementation(handoff, specification, [skill], { number: 124, url: "https://example.test/pr/124", merged: false }).reconciledAt, undefined);
  assert.equal(subject.reconcileSkillImplementation(handoff, specification, [skill], { number: 124, url: "https://example.test/pr/124", merged: true }, new Date("2026-09-22T01:00:00Z")).implementedSkillId, specification.proposedSkillId);
});
