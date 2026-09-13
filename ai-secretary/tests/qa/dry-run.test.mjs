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
test("approved external action is DRY_RUN, never EXECUTED or Mission complete", async () => {
  const s = fixture([
    { type: "action", actionType: "PUBLISH", payload: { content: "draft" } },
  ]);
  await runner.runAgent(s, "m", agent, worker);
  assert.equal(s.missions[0].status, "WAITING_APPROVAL");
  s.approvals[0].status = "APPROVED";
  s.actionRequests[0].status = "APPROVED";
  await runner.runAgent(s, "m", agent, worker);
  assert.equal(s.runtime.executions[0].status, "DRY_RUN");
  assert.equal(s.actionRequests[0].status, "APPROVED");
  assert.notEqual(s.missions[0].status, "COMPLETED");
});
test("revoked permission and expired approval cannot reach executor", () => {
  for (const revoke of [true, false]) {
    const s = fixture();
    const a = submit(s, "PUBLISH", { content: "draft" });
    s.approvals[0].status = "APPROVED";
    a.request.status = "APPROVED";
    if (!revoke) s.approvals[0].expiresAt = "2000-01-01";
    assert.equal(
      actions.executeStoredAction(
        s,
        a.request.id,
        revoke ? { ...agent, granted: [] } : agent,
      ).status,
      "BLOCKED",
    );
  }
});
test("trade is blocked even after forged approval, with no executor", () => {
  const s = fixture();
  const a = submit(s, "INVESTMENT_TRADE");
  a.request.status = "APPROVED";
  a.request.riskLevel = "R1";
  assert.equal(
    actions.executeStoredAction(s, a.request.id, agent).status,
    "BLOCKED",
  );
  assert.equal(registry.hasExecutor("INVESTMENT_TRADE"), false);
});
