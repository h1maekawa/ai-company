import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const workflow = require(path.join(process.env.QA_DIST, "out/app/lib/company/execution/creatorWorkflow.js"));
const planModule = require(path.join(process.env.QA_DIST, "out/app/lib/company/execution/executionPlan.js"));

function plan() {
  return planModule.createExecutionPlan({ missionId: "mission-1", traceId: "trace-1", agentId: "personal-note", objective: "AI半導体についてnoteを書く", steps: workflow.creatorWorkflowSteps(), expectedOutputs: ["draft"] });
}

test("複合作業だけがCreator Multi-Agent候補になる", () => {
  assert.equal(workflow.isCreatorMultiAgentDirective("AI半導体を調べてnoteを書いて"), true);
  assert.equal(workflow.isCreatorMultiAgentDirective("KPIを分析して改善投稿を作って"), true);
  assert.equal(workflow.isCreatorMultiAgentDirective("AI半導体を調べて"), false);
  assert.equal(workflow.isCreatorMultiAgentDirective("この文章をnoteにして"), false);
});

test("Creator Lead planは既存4 Agentへ複数Stepを割り当てる", () => {
  const value = plan();
  assert.equal(value.steps.length, 5);
  assert.deepEqual(new Set(value.steps.map((step) => step.assignedAgentId)), new Set(["creator-research", "creator-kpi", "creator-content", "personal-note"]));
  assert.deepEqual(value.steps.find((step) => step.id === "creator_content").dependsOn, ["creator_research", "creator_kpi"]);
  assert.equal(value.steps.at(-1).humanRequired, true);
});

test("依存しないResearchとKPIは上限2でreadyになりContentは待機する", () => {
  const value = { ...plan(), maxParallel: 99 };
  assert.deepEqual(planModule.readyExecutionSteps(value).map((step) => step.id), ["creator_research", "creator_kpi"]);
  value.steps.find((step) => step.id === "creator_research").status = "COMPLETE";
  assert.deepEqual(planModule.readyExecutionSteps(value).map((step) => step.id), ["creator_kpi"]);
  value.steps.find((step) => step.id === "creator_kpi").status = "COMPLETE";
  assert.deepEqual(planModule.readyExecutionSteps(value).map((step) => step.id), ["creator_content"]);
});

test("Parent progressは実Step状態から導出し失敗を完了扱いしない", () => {
  const value = plan();
  assert.deepEqual(workflow.deriveCreatorWorkflowProgress(value), { completed: 0, total: 5, status: "PENDING" });
  value.steps[0].status = "COMPLETE";
  assert.equal(workflow.deriveCreatorWorkflowProgress(value).status, "RUNNING");
  value.steps[1].status = "FAILED";
  assert.equal(workflow.deriveCreatorWorkflowProgress(value).status, "BLOCKED");
});

test("Lead完了後はHuman Reviewを飛ばさず承認待ちになりKnowledge参照を保持する", () => {
  const value = plan();
  value.steps.slice(0, 4).forEach((step) => { step.status = "COMPLETE"; });
  value.steps[0].knowledgeRefs = ["knowledge:k-1"];
  value.steps[2].knowledgeRefs = ["knowledge:k-1", "knowledge:k-2"];
  assert.deepEqual(workflow.deriveCreatorWorkflowProgress(value), { completed: 4, total: 5, status: "WAITING_APPROVAL" });
  assert.deepEqual(value.steps[0].knowledgeRefs, ["knowledge:k-1"]);
  assert.deepEqual(value.steps[2].knowledgeRefs, ["knowledge:k-1", "knowledge:k-2"]);
  assert.equal(value.steps[4].humanRequired, true);
});

test("Lead integrationはResearch/KPI/Contentの参照が揃うまでreadyにならない", () => {
  const value = plan();
  assert.equal(workflow.integrateCreatorResults(value, { creator_research: "sources" }).ready, false);
  const integrated = workflow.integrateCreatorResults(value, { creator_research: "sources", creator_kpi: "facts and interpretation", creator_content: "draft" });
  assert.equal(integrated.ready, true);
  assert.deepEqual(integrated.inputRefs, ["step:creator_research", "step:creator_kpi", "step:creator_content"]);
});

test("失敗はReplan Proposalになり複数失敗はHuman Attentionを要求する", () => {
  assert.equal(workflow.proposeCreatorReplan("m", [{ id: "a", status: "COMPLETE" }]), null);
  assert.deepEqual(workflow.proposeCreatorReplan("m", [{ id: "a", status: "FAILED" }, { id: "b", status: "BLOCKED" }]), { missionId: "m", failedStepIds: ["a", "b"], action: "HUMAN_ATTENTION", requiresHumanConfirmation: true });
});

test("Skill Opportunityは3 Mission未満では作らずRegistryやCodeを変更しない", () => {
  assert.equal(workflow.creatorSkillOpportunity({ missionIds: ["m1"], repeatedSteps: ["research"], knowledgeIds: ["k1"], suggestedAgents: ["creator-research"] }), null);
  const candidate = workflow.creatorSkillOpportunity({ missionIds: ["m1", "m2", "m3"], repeatedSteps: ["research"], knowledgeIds: ["k1"], suggestedAgents: ["creator-research"] });
  assert.equal(candidate.status, "CANDIDATE");
  assert.equal(candidate.engineeringRequestAllowed, false);
  assert.equal(candidate.registryMutationAllowed, false);
  assert.equal(candidate.usageCount, 3);
});
