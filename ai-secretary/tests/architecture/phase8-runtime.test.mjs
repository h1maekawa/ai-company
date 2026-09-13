import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read = (path) => fs.readFileSync(new URL("../../" + path, import.meta.url), "utf8");
const durable = read("app/lib/company/runtime/durableExecutionStore.ts");
const runner = read("app/lib/company/runtime/productionRunner.ts");
const cycle = read("app/lib/company/runtime/autonomousCycle.ts");
const registry = read("app/lib/company/execution/executorRegistry.ts");

test("durable state uses optimistic CAS and mission fencing", () => {
  assert.match(durable, /current ~= tonumber\(ARGV\[1\]\)/);
  assert.match(durable, /fencingToken/);
  assert.match(durable, /PTTL/);
  assert.match(durable, /ExecutionConflictError/);
});

test("mission lease rejects overlap and heartbeats during model work", () => {
  assert.match(runner, /if \(!lease\)/);
  assert.match(runner, /MISSION_BUSY/);
  assert.match(runner, /setInterval/);
  assert.match(runner, /heartbeatLease/);
});

test("checkpoint recovery marks uncertain in-flight model results", () => {
  assert.match(runner, /UNKNOWN_RESULT/);
  assert.match(runner, /MODEL_RESULT_UNKNOWN/);
  assert.match(runner, /step\.status = "PENDING"/);
});

test("autonomous cycle is globally leased and bounded", () => {
  assert.match(cycle, /__autonomous_cycle__/);
  assert.match(cycle, /maxMissions/);
  assert.match(cycle, /maxRuntimeMs/);
  assert.match(cycle, /CYCLE_BUSY/);
});

test("GMAIL_SEND stays blocked because no executor exists", () => {
  assert.doesNotMatch(registry, /actionType:\s*"GMAIL_SEND"/);
});
