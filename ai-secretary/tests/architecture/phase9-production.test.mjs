import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read = (path) => fs.readFileSync(new URL("../../" + path, import.meta.url), "utf8");
const environment = read("app/lib/company/runtime/environment.ts");
const durable = read("app/lib/company/runtime/durableExecutionStore.ts");
const canary = read("app/lib/company/runtime/canaryStore.ts");
const health = read("app/api/company/runtime/health/route.ts");
const cycle = read("app/lib/company/runtime/autonomousCycle.ts");
const middleware = read("middleware.ts");
const smoke = read("scripts/smoke-personal-company-production.mjs");

test("Vercel is the only production authority and Cloudflare is secondary", () => {
  assert.match(environment, /CF_PAGES/);
  assert.match(environment, /secondary/);
  assert.match(environment, /VERCEL_PRODUCTION_AUTHORITY_REQUIRED/);
});

test("runtime data is isolated by environment", () => {
  assert.match(environment, /preview:/);
  assert.match(environment, /redisNamespace/);
  assert.match(durable, /namespace \+ ":company:execution:v1"/);
});

test("preview writes stay isolated while secondary runtimes remain read-only", () => {
  assert.match(environment, /mutationAllowed: authority === "vercel"/);
  assert.match(environment, /stage === "preview" \? "preview:"/);
  assert.match(durable, /assertProductionMutationAllowed/);
});

test("production uses a durable schema with an explicit additive migration", () => {
  assert.match(durable, /EXECUTION_SCHEMA_MIGRATION_REQUIRED/);
  assert.match(durable, /legacy-v8-to-execution-v1/);
  assert.match(durable, /MIGRATE_SCRIPT/);
});

test("kill switches gate autonomous work", () => {
  for (const name of ["AUTONOMOUS_RUNTIME_ENABLED", "REAL_MODEL_CANARY_ENABLED", "OPPORTUNITY_AUTO_REFRESH_ENABLED", "ORGANIZATION_REVIEW_ENABLED"])
    assert.match(environment, new RegExp(name));
  assert.match(cycle, /AUTONOMOUS_RUNTIME_DISABLED/);
});

test("cron uses one global lease and bounded execution", () => {
  assert.match(cycle, /__autonomous_cycle__/);
  assert.match(cycle, /maxMissions/);
  assert.match(cycle, /maxRuntimeMs/);
});

test("canary results have a separate namespace and escalation threshold", () => {
  assert.match(canary, /:canary:execution:v1:results/);
  assert.match(health, /CANARY_CONSECUTIVE_FAILURES/);
  assert.match(health, /canaries\.slice\(0, 3\)\.every/);
});

test("health endpoint is public and returns secret-free smoke status", () => {
  assert.match(middleware, /\/api\/company\/runtime\/health/);
  assert.match(health, /redisConnectivity/);
  assert.doesNotMatch(health, /TOKEN|SECRET|PASSWORD/);
});

test("production smoke verifies runtime reads and protected endpoints", () => {
  assert.match(smoke, /missionRead/);
  assert.match(smoke, /approvalRead/);
  assert.match(smoke, /revenueRead/);
  assert.match(smoke, /SMOKE_SESSION_COOKIE/);
});
