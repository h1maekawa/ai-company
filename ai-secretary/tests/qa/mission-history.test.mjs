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
test("step history remains after repeat run and plan completion", async () => {
  const s = fixture();
  await runner.runAgent(s, "m", agent, worker);
  const old = structuredClone(s.runtime.runs.m.history);
  await runner.runAgent(s, "m", agent, worker);
  assert.deepEqual(s.runtime.runs.m.history, old);
  assert.ok(s.missions[0].history.some((h) => h.to === "REVIEWING"));
});
