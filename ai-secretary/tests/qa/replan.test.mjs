import test from "node:test";
import assert from "node:assert/strict";
import {
  fixture,
  agent,
  worker,
  submit,
  runner,
  actions,
  registry,
  learning,
  performance,
  lifecycle,
} from "./phase7-fixture.mjs";
test("step failures replan with persistent count and stop at upper bound", async () => {
  const s = fixture();
  const failing = async () => {
    throw new Error("STEP_FAIL");
  };
  for (let i = 0; i < 4; i++) await runner.runAgent(s, "m", agent, failing);
  assert.equal(s.runtime.runs.m.replans, 2);
  assert.equal(s.missions[0].status, "FAILED");
});
test("CEO rejected proposal cannot be resubmitted unchanged", async () => {
  const s = fixture([
    { type: "action", actionType: "PUBLISH", payload: { content: "original" } },
  ]);
  await runner.runAgent(s, "m", agent, worker);
  const a = s.actionRequests[0];
  a.status = "REJECTED";
  a.reason = "Revise wording";
  s.approvals[0].status = "REJECTED";
  s.missions[0].status = "REPLAN_REQUIRED";
  learning.recordLearning(s, "APPROVAL_REJECTED", s.approvals[0].id, {
    missionId: "m",
    reason: a.reason,
    originalProposal: a.payloadSummary,
  });
  await runner.runAgent(s, "m", agent, worker);
  assert.equal(s.runtime.runs.m.replans, 1);
  assert.equal(s.runtime.runs.m.rejectionReason, "Revise wording");
  assert.equal(s.actionRequests.length, 1);
  assert.equal(s.runtime.learning[0].type, "APPROVAL_REJECTED");
});
