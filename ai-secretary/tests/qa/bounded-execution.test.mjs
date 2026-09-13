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
test("more than ten steps stop across repeated Run requests", async () => {
  const s = fixture(Array.from({ length: 30 }, () => ({ type: "analysis" })));
  await runner.runAgent(s, "m", agent, worker);
  assert.equal(s.runtime.runs.m.steps, 10);
  assert.equal(s.runtime.runs.m.stopReason, "MAX_STEPS");
  await runner.runAgent(s, "m", agent, worker);
  assert.equal(s.runtime.runs.m.steps, 10);
});
test("hanging worker terminates within deadline and cannot mutate outputs later", async () => {
  const s = fixture();
  let resolve;
  const p = new Promise((r) => (resolve = r));
  const start = Date.now();
  await runner.runAgent(s, "m", agent, () => p, { maxExecutionTime: 20 });
  assert.ok(Date.now() - start < 500);
  assert.equal(s.missions[0].status, "FAILED");
  resolve("Report");
  await new Promise((r) => setTimeout(r, 5));
  assert.equal(s.runtime.artifacts.length, 0);
});
test("invalid limits never disable bound", async () => {
  for (const maxSteps of [Infinity, NaN, -1, 0, 1000])
    await assert.rejects(
      runner.runAgent(fixture(), "m", agent, worker, { maxSteps }),
    );
});
