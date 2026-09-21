import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
const read = (file) => fs.readFileSync(path.join(process.cwd(), file), "utf8");

test("Creator workflow reuses Mission/Execution Store and has no second Runtime", () => {
  const service = read("app/lib/company/execution/service.ts");
  const approve = read("app/api/company/directives/approve/route.ts");
  assert.match(service, /saveExecutionState/);
  assert.match(approve, /createManualMission/);
  assert.match(approve, /CREATOR_MULTI_AGENT/);
});

test("Creator plan records dependency, assigned Agent, references and bounded parallelism", () => {
  const workflow = read("app/lib/company/execution/creatorWorkflow.ts");
  const plan = read("app/lib/company/execution/executionPlan.ts");
  for (const agent of ["personal-note", "creator-research", "creator-content", "creator-kpi"]) assert.match(workflow, new RegExp(agent));
  assert.match(workflow, /dependsOn: \["creator_research", "creator_kpi"\]/);
  assert.match(plan, /Math\.min\([\s\S]*, 2\)/);
  assert.match(plan, /knowledgeRefs/);
  assert.match(plan, /outputRefs/);
});

test("Knowledge is searched by reference and formal promotion is not part of workflow", () => {
  const service = read("app/lib/company/execution/service.ts");
  const workflow = read("app/lib/company/execution/creatorWorkflow.ts");
  assert.match(service, /buildKnowledgeContext/);
  assert.match(service, /knowledgeRefs/);
  assert.doesNotMatch(workflow, /saveKnowledge|promoteKnowledge|promoteCandidate/);
});

test("UI uses actual Mission steps and chat receives the server-side Department model", () => {
  const page = read("components/mobile-ceo/DepartmentPage.tsx");
  const employees = read("app/api/company/departments/[id]/employees/route.ts");
  const chat = read("app/api/chat/route.ts");
  assert.match(page, /workflow\.completed/);
  assert.match(page, /step\.knowledgeRefs/);
  assert.match(employees, /currentStep/);
  assert.match(chat, /Current Department Read Model/);
});

test("Human review, publish, investment and engineering boundaries remain explicit", () => {
  const workflow = read("app/lib/company/execution/creatorWorkflow.ts");
  const actionTypes = read("app/lib/company/execution/actionTypes.ts");
  const fund = read("app/lib/fund/engine.ts");
  const engineering = read("app/lib/engineering/worker.ts");
  assert.match(workflow, /humanRequired: true/);
  assert.doesNotMatch(workflow, /publish\.publish|submitOrder|placeOrder/);
  assert.match(actionTypes, /INVESTMENT_TRADE[\s\S]*R4/);
  assert.match(fund, /executionAuthority: "HUMAN_ONLY"/);
  assert.match(fund, /aiExecutionAllowed: false/);
  assert.doesNotMatch(engineering, /autoMerge|productionDeploy/);
});
