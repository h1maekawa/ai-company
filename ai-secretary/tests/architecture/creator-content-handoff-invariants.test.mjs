import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read = (file) => fs.readFileSync(file, "utf8");

test("Content Handoff reuses Execution Store and existing X/note stores", () => {
  const handoff = read("app/lib/company/execution/contentHandoff.ts");
  const state = read("app/lib/company/execution/store.ts");
  assert.match(state, /contentDraftCandidates/);
  assert.match(handoff, /loadSocialDrafts/);
  assert.match(handoff, /loadNoteQueue/);
  assert.doesNotMatch(handoff, /new Database|createTable|prisma/);
});

test("Draft registration requires Lead and Human review and never creates Publish job", () => {
  const handoff = read("app/lib/company/execution/contentHandoff.ts");
  assert.match(handoff, /LEAD_REVIEW_REQUIRED/);
  assert.match(handoff, /HUMAN_APPROVAL_REQUIRED/);
  assert.match(handoff, /status: "draft"/);
  assert.doesNotMatch(handoff, /saveHistory|publishTo|bufferPost|jobs:/);
});

test("Content Agent cannot register; Lead creates Candidate and Gateway creates approval", () => {
  const runner = read("app/lib/company/execution/agentRunner.ts");
  assert.match(runner, /step\.id === "creator_lead_review"/);
  assert.match(runner, /createContentDraftCandidate/);
  assert.match(runner, /submitAction[\s\S]*PUBLISH_DRAFT/);
  assert.doesNotMatch(read("app/lib/company/execution/creatorWorkflow.ts"), /registerApprovedContentDraft/);
});

test("Slack Draft Ready notification opens detail and cannot one-tap approve", () => {
  const events = read("app/lib/notifications/events.ts");
  const slack = read("app/lib/notifications/slack.ts");
  assert.match(events, /CONTENT_DRAFT_READY/);
  assert.match(slack, /approvalKind !== "CONTENT_DRAFT_REGISTRATION"/);
  assert.match(slack, /AI Companyで確認/);
});

test("Mobile Candidate edit is same-origin, idempotent and cannot mutate lineage", () => {
  const route = read("app/api/company/content-draft-candidates/[id]/route.ts");
  assert.match(route, /isSameOriginMutation/);
  assert.match(route, /idempotency-key/);
  assert.match(route, /content-draft-candidate-edit/);
  assert.match(route, /const updated = \{ \.\.\.candidate, title:/);
  assert.doesNotMatch(route, /parentMissionId\s*:/);
  assert.doesNotMatch(route, /sourceKnowledgeIds\s*:/);
});

test("Financial and Engineering safety invariants remain unchanged", () => {
  const actions = read("app/lib/company/execution/actionTypes.ts");
  const fund = read("app/lib/fund/engine.ts");
  const engineering = read("app/lib/engineering/worker.ts");
  assert.match(actions, /INVESTMENT_TRADE[\s\S]*R4/);
  assert.match(fund, /executionAuthority: "HUMAN_ONLY"/);
  assert.match(fund, /aiExecutionAllowed: false/);
  assert.doesNotMatch(engineering, /autoMerge|productionDeploy/);
});
