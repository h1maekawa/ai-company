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
test("two contributors never exceed 500 yen; repeated revenue id is not double counted", () => {
  const s = fixture();
  const e = {
    id: "r",
    kind: "revenue",
    missionId: "m",
    originAgentId: "b",
    confirmedByHuman: true,
    sourceType: "note",
    amountYen: 500,
  };
  const c = performance.safeRevenueContributions([e, e], s);
  assert.deepEqual(c.byAgent, { a: 250, b: 250 });
  assert.equal(c.totalRevenueYen, 500);
});
test("odd yen and missing measurements do not inflate KPI", () => {
  const s = fixture();
  const e = {
    id: "r",
    kind: "revenue",
    missionId: "m",
    originAgentId: "b",
    confirmedByHuman: true,
    sourceType: "note",
    amountYen: 501,
  };
  const c = performance.safeRevenueContributions([e], s);
  assert.equal(
    Object.values(c.byAgent).reduce((a, b) => a + b, 0),
    501,
  );
  const p = performance.agentPerformance(s, [])[0];
  assert.equal(p.reviewPassRate, null);
  assert.equal(p.averageLatencyMs, null);
});
