import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read = (path) => fs.readFileSync(new URL("../../" + path, import.meta.url), "utf8");
const config = read("app/lib/company/runtime/runtimeConfig.ts");
const cycle = read("app/lib/company/runtime/autonomousCycle.ts");
const eligibility = read("app/lib/company/runtime/autonomousEligibility.ts");
const cron = read("app/api/cron/personal-company-runtime/route.ts");
const registry = read("app/lib/company/execution/executorRegistry.ts");

test("Phase 10-B.1 runs at most one already-started mission per cycle", () => {
  assert.match(config, /maxMissionsPerCycle:\s*1/);
  assert.match(cycle, /\.slice\(0, maxMissions\)/);
  assert.doesNotMatch(cycle, /startMission/);
  assert.match(eligibility, /"ACTIVE", "EXECUTING", "REVIEWING", "REPLAN_REQUIRED"/);
});

test("autonomous eligibility requires assignment, plan, no approval, and executable skills", () => {
  for (const token of ["PENDING_APPROVAL", "ASSIGNED_AGENT_NOT_FOUND", "VALID_EXECUTION_PLAN_REQUIRED", "R4_AGENT_FORBIDDEN", "SKILL_NOT_EXECUTABLE"])
    assert.match(eligibility, new RegExp(token));
});

test("only internal executor actions are eligible", () => {
  for (const action of ["MISSION_STATUS_UPDATE", "INTERNAL_MEMORY_WRITE", "INTERNAL_REPORT_CREATE"])
    assert.match(eligibility, new RegExp(action));
  for (const action of ["GMAIL_SEND", "PUBLISH", "GITHUB_WRITE", "PAYMENT", "AD_SPEND", "INVESTMENT_TRADE"])
    assert.doesNotMatch(registry, new RegExp(`actionType:\\s*["']${action}["']`));
  assert.match(eligibility, /NON_INTERNAL_ACTION/);
});

test("a cron cycle cannot proceed unless its canary passed", () => {
  assert.match(cron, /canary\.status !== "PASS"/);
  assert.match(cron, /CANARY_NOT_PASSED/);
  assert.ok(cron.indexOf("CANARY_NOT_PASSED") < cron.lastIndexOf("runAutonomousCycle"));
});

test("global and mission leases plus idempotency remain in the execution path", () => {
  assert.match(cycle, /__autonomous_cycle__/);
  assert.match(cycle, /runProductionMission/);
  assert.match(cycle, /cycleId \+ ":" \+ mission\.id/);
  assert.match(cycle, /processed, skipped/);
});
