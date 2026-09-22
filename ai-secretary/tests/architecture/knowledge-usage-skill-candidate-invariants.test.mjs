import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
const read = (path) => fs.readFileSync(path, "utf8");

test("Knowledge Usage is derived from completed StepHistory, not search hits or a second SSOT", () => {
  const source = read("app/lib/company/evolution/skillCandidates.ts");
  assert.match(source, /history\.status !== "COMPLETE"/);
  assert.match(source, /history\.knowledgeRefs/);
  assert.match(source, /missionId.*stepId.*knowledgeId.*agentId/);
  assert.doesNotMatch(source, /saveVaultFile|createTable|prisma/);
});

test("Skill Candidate reuses creatorSkillOpportunity and stays outside Skill Registry", () => {
  const source = read("app/lib/company/evolution/skillCandidates.ts");
  const registry = read("app/lib/skills/registry.ts");
  assert.match(source, /creatorSkillOpportunity/);
  assert.match(source, /executable: false/);
  assert.match(source, /engineeringRequestAllowed: false/);
  assert.doesNotMatch(registry, /skill_candidate_/);
});

test("Human review endpoint is same-origin and idempotent without executable approval", () => {
  const route = read("app/api/company/skill-candidates/[id]/decision/route.ts");
  assert.match(route, /isSameOriginMutation/);
  assert.match(route, /idempotency-key/);
  assert.match(route, /engineeringStarted: false/);
  assert.match(route, /registryChanged: false/);
  assert.doesNotMatch(route, /GITHUB_WRITE|createEngineeringRequest|executeSkill/);
});

test("Knowledge and AI Company improvement UIs expose real usage and review detail", () => {
  const knowledge = read("components/knowledge/KnowledgeDashboard.tsx");
  const organization = read("app/company/organization/page.tsx");
  assert.match(knowledge, /detail\.usage\.missions/);
  assert.match(knowledge, /Related Skill Candidates/);
  assert.match(organization, /Skill化を承認/);
  assert.match(organization, /existingSimilarSkillIds/);
});

test("Notification deep-links to review and financial/engineering safety remains intact", () => {
  const notifications = read("app/lib/notifications/events.ts");
  const actions = read("app/lib/company/execution/actionTypes.ts");
  const fund = read("app/lib/fund/engine.ts");
  const engineering = read("app/lib/engineering/worker.ts");
  assert.match(notifications, /SKILL_CANDIDATE_REVIEW/);
  assert.match(notifications, /company\/organization#skill-candidate/);
  assert.match(actions, /INVESTMENT_TRADE[\s\S]*R4/);
  assert.match(fund, /executionAuthority: "HUMAN_ONLY"/);
  assert.match(fund, /aiExecutionAllowed: false/);
  assert.doesNotMatch(engineering, /autoMerge|productionDeploy/);
});
