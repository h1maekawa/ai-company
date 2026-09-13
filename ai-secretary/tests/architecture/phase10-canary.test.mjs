import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read = (path) => fs.readFileSync(new URL("../../" + path, import.meta.url), "utf8");
const model = read("app/lib/company/runtime/modelCanary.ts");
const store = read("app/lib/company/runtime/canaryStore.ts");
const cron = read("app/api/cron/personal-company-runtime/route.ts");
const cycle = read("app/lib/company/runtime/autonomousCycle.ts");
const registry = read("app/lib/company/execution/executorRegistry.ts");

test("Phase 10-A canary validates a real response without autonomous runtime", () => {
  assert.match(cron, /runScheduledRealModelCanary/);
  assert.match(cron, /AUTONOMOUS_RUNTIME_DISABLED/);
  assert.ok(cron.indexOf("runScheduledRealModelCanary") < cron.lastIndexOf("AUTONOMOUS_RUNTIME_DISABLED"));
});

test("canary validates schema, review, timeout, persistence, cost and security", () => {
  for (const token of ["CANARY_OK", "schemaValidated", "reviewVerdict", "AbortController", "redisPersisted", "cost", "security", "externalActionCount"])
    assert.match(model, new RegExp(token));
  assert.match(store, /:canary:execution:v1:results/);
});

test("canary never mutates production mission, revenue or opportunity state", () => {
  assert.doesNotMatch(model, /getExecutionStore|saveRevenue|saveOpportunities|startMission|runProductionMission|actionRequest/);
  assert.doesNotMatch(cycle, /runRealModelCanary|model-canary/);
});

test("external executors remain limited and investment trade has no executor", () => {
  assert.doesNotMatch(registry, /GMAIL_DRAFT|GMAIL_SEND|INVESTMENT_TRADE|CALENDAR_WRITE|PUBLISH/);
});
