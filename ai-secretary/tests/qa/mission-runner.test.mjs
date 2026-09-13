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
test("agent completes required steps, review, report and records success", async () => {
  const s = fixture();
  await runner.runAgent(s, "m", agent, worker);
  assert.equal(s.missions[0].status, "COMPLETED");
  assert.ok(s.runtime.learning.some((e) => e.type === "MISSION_SUCCEEDED"));
  assert.equal(s.runtime.artifacts.length, 1);
});
test("missing agent and denied permissions are blocked without automatic retry", async () => {
  for (const a of [null, { ...agent, granted: [] }]) {
    const s = fixture();
    await runner.runAgent(s, "m", a, worker);
    assert.equal(s.missions[0].status, "BLOCKED");
    const n = s.runtime.runs.m.steps;
    await runner.runAgent(s, "m", a, worker);
    assert.equal(s.runtime.runs.m.steps, n);
  }
});
test("no required review cannot complete", async () => {
  const s = fixture([{ type: "generate" }]);
  await runner.runAgent(s, "m", agent, worker);
  assert.notEqual(s.missions[0].status, "COMPLETED");
});

test("checkpoints publish executing and reviewing state before completion", async () => {
  const state = fixture();
  const observed = [];
  await runner.runAgent(state, "m", agent, worker, {}, async (snapshot) => {
    observed.push(snapshot.missions[0].status);
  });
  assert.ok(observed.includes("EXECUTING"));
  assert.ok(observed.includes("REVIEWING"));
});
