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
test("only three internal executors exist; no trade or external executor", () => {
  assert.deepEqual(registry.registeredActionTypes().sort(), [
    "INTERNAL_MEMORY_WRITE",
    "INTERNAL_REPORT_CREATE",
    "MISSION_STATUS_UPDATE",
  ]);
  assert.equal(registry.hasExecutor("INVESTMENT_TRADE"), false);
  assert.equal(registry.resolveInternalExecutor, undefined);
});
test("unknown action and missing registered request default deny", () => {
  const s = fixture();
  assert.equal(submit(s, "UNKNOWN").result.status, "BLOCKED");
  assert.equal(
    actions.executeStoredAction(s, "forged", agent).status,
    "BLOCKED",
  );
});
test("non-executable analysis action records NO_EXECUTOR", () => {
  assert.equal(submit(fixture(), "ANALYSIS").result.status, "NO_EXECUTOR");
});
