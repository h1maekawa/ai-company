import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const subject = require(path.join(process.env.QA_DIST, "out/app/lib/company/evolution/skillCandidates.js"));

function state(count = 3) {
  const missions = []; const plans = []; const runs = {};
  for (let index = 1; index <= count; index++) {
    const missionId = `mission-${index}`; const planId = `plan-${index}`;
    missions.push({ id: missionId, title: `Creator Mission ${index}`, status: "COMPLETED", version: 0, history: [], actionRequestIds: [], executionPlanId: planId });
    plans.push({ id: planId, missionId, traceId: `trace-${index}`, agentId: "personal-note", departmentId: "creator", workflowKind: "CREATOR_MULTI_AGENT", objective: "research", expectedOutputs: [], riskLevel: "R0", createdAt: "2026-09-21T00:00:00.000Z", steps: [{ id: "market_brief", order: 1, title: "Market brief", type: "research", status: "COMPLETE", assignedAgentId: "creator-research", knowledgeRefs: ["knowledge-hbm"], inputRefs: ["mission:goal", "knowledge:shared"], outputRefs: [`mission:${missionId}:output`] }] });
    const usage = { planId, stepId: "market_brief", at: `2026-09-2${index}T00:00:00.000Z`, status: "COMPLETE", agentId: "creator-research", knowledgeRefs: ["knowledge-hbm"], outputRefs: [`mission:${missionId}:output`] };
    runs[missionId] = { steps: 1, modelCalls: 1, retries: 0, replans: 0, elapsedMs: 1, rejectedProposals: [], history: [usage, { ...usage, at: `2026-09-2${index}T00:01:00.000Z` }] };
  }
  return { missions, plans, actionRequests: [], approvals: [], contentDraftCandidates: [], skillCandidates: [], runtime: { runs, executions: [], artifacts: [], learning: [] } };
}

test("完了したStepのknowledgeRefsだけがUsageになりretryは重複しない", () => {
  const value = state(1);
  assert.equal(subject.deriveKnowledgeUsage(value).length, 1);
  value.runtime.runs["mission-1"].history[0].status = "RUNNING";
  value.runtime.runs["mission-1"].history[1].status = "RUNNING";
  assert.equal(subject.deriveKnowledgeUsage(value).length, 0);
  value.plans[0].steps[0].knowledgeRefs.push("search-hit-only");
  assert.equal(subject.deriveKnowledgeUsage(value).length, 0);
});

test("Secret-like referenceはUsageやCandidate Evidenceへ保存しない", () => {
  const value = state(1);
  value.runtime.runs["mission-1"].history[0].knowledgeRefs.push("api_key=sk-sensitive");
  assert.deepEqual(subject.deriveKnowledgeUsage(value).map((event) => event.knowledgeId), ["knowledge-hbm"]);
});

test("UsageはMission・Agentへ追跡でき、別Missionは別利用になる", () => {
  const usage = subject.deriveKnowledgeUsage(state(3));
  assert.equal(usage.length, 3);
  assert.deepEqual(new Set(usage.map((event) => event.missionId)), new Set(["mission-1", "mission-2", "mission-3"]));
  assert.deepEqual(new Set(usage.map((event) => event.agentId)), new Set(["creator-research"]));
});

test("Usage source unavailableはUNKNOWN、availableな0件はCONFIRMED 0", () => {
  assert.deepEqual(subject.summarizeKnowledgeUsage(null, "k"), { status: "UNKNOWN", count: null, agents: [], missions: [], lastUsedAt: null });
  assert.equal(subject.summarizeKnowledgeUsage([], "k").count, 0);
});

test("1/2 Missionでは候補なし、3 distinct Missionsで決定論的Candidate", () => {
  assert.equal(subject.discoverSkillCandidates(state(1), []).length, 0);
  assert.equal(subject.discoverSkillCandidates(state(2), []).length, 0);
  const first = subject.discoverSkillCandidates(state(3), [], new Date("2026-09-21T00:00:00Z"));
  const second = subject.discoverSkillCandidates(state(3), [], new Date("2026-09-22T00:00:00Z"));
  assert.equal(first.length, 1); assert.equal(first[0].id, second[0].id);
  assert.equal(first[0].usageCount, 3); assert.deepEqual(first[0].sourceKnowledgeIds, ["knowledge-hbm"]);
  assert.equal(first[0].executable, false); assert.equal(first[0].registryMutationAllowed, false);
});

test("既存Skill matchは重複Candidateを作らず既存CandidateはEvidence更新", () => {
  const value = state(3); value.plans.forEach((plan) => { plan.steps[0].id = "creator_kpi"; value.runtime.runs[plan.missionId].history.forEach((item) => { item.stepId = "creator_kpi"; }); });
  const skill = { id: "content-kpi-analysis", name: "KPI", description: "", category: "research", allowedSecretaries: [], inputSchemaDescription: "", outputSchemaDescription: "", status: "planned" };
  assert.equal(subject.discoverSkillCandidates(value, [skill]).length, 0);
  const base = state(3); base.skillCandidates = subject.discoverSkillCandidates(base, [], new Date("2026-09-21T00:00:00Z"));
  const extra = state(4); extra.skillCandidates = base.skillCandidates;
  const updated = subject.discoverSkillCandidates(extra, [], new Date("2026-09-22T00:00:00Z"));
  assert.equal(updated.length, 1); assert.equal(updated[0].usageCount, 4); assert.equal(updated[0].sourceMissionIds.length, 4);
});

test("Human decisionはApprove/Reject/Holdのみで実装やEngineeringを開始しない", () => {
  const candidate = subject.discoverSkillCandidates(state(3), [])[0];
  for (const decision of ["APPROVED", "HOLD"]) {
    const decided = subject.decideSkillCandidate(candidate, decision, undefined, new Date("2026-09-22T00:00:00Z"));
    assert.equal(decided.status, decision); assert.equal(decided.decision.actor, "ceo"); assert.equal(decided.engineeringRequestAllowed, false); assert.equal(decided.registryMutationAllowed, false);
  }
  assert.throws(() => subject.decideSkillCandidate(candidate, "REJECTED"), /REJECTION_REASON_REQUIRED/);
  assert.equal(subject.decideSkillCandidate(candidate, "REJECTED", "不要").status, "REJECTED");
});
