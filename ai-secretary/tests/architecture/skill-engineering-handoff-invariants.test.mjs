import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
const read = (path) => fs.readFileSync(path, "utf8");

test("three Human Gates are separate and no endpoint auto-crosses ai-ready", () => {
  const candidate = read("app/api/company/skill-candidates/[id]/decision/route.ts");
  const specification = read("app/api/company/skill-specifications/[id]/decision/route.ts");
  const issue = read("app/api/company/skill-specifications/[id]/engineering-request/route.ts");
  const ready = read("app/api/company/skill-specifications/[id]/ai-ready/route.ts");
  assert.doesNotMatch(candidate + specification + issue, /addAiReadyLabel/);
  assert.match(specification, /issueCreated: false, aiReady: false/);
  assert.match(issue, /labels: \["ai-engineering", "skill-candidate"/);
  assert.doesNotMatch(issue, /"ai-ready"/);
  assert.match(ready, /addAiReadyLabel/);
});

test("ai-ready is authenticated by middleware, same-origin, idempotent and server-bound", () => {
  const middleware = read("middleware.ts");
  const ready = read("app/api/company/skill-specifications/[id]/ai-ready/route.ts");
  assert.doesNotMatch(middleware, /skill-specifications/);
  assert.match(ready, /isSameOriginMutation/);
  assert.match(ready, /idempotency-key/);
  assert.match(ready, /skillEngineeringHandoffs\.find/);
  assert.doesNotMatch(ready, /body\.issue|issueNumber.*body/);
});

test("generic Engineering Issue creation no longer grants Worker permission", () => {
  const route = read("app/api/engineering/requests/route.ts");
  assert.match(route, /labels: \["ai-engineering", `type:/);
  assert.doesNotMatch(route, /labels: \["ai-engineering", "ai-ready"/);
  assert.match(read("app/lib/engineering/security.ts"), /labels\.has\("ai-engineering"\).*labels\.has\("ai-ready"\)/);
});

test("handoff reuses Execution Store, GitHub integration and Skill Registry without duplicate runtime", () => {
  const store = read("app/lib/company/execution/store.ts");
  const engineering = read("app/lib/company/evolution/skillEngineering.ts");
  assert.match(store, /skillEngineeringSpecifications/);
  assert.match(store, /skillEngineeringHandoffs/);
  assert.match(engineering, /SkillDefinition/);
  assert.doesNotMatch(engineering, /createTable|prisma|new EngineeringWorker/);
});

test("financial, creator and worker safety contracts remain unchanged", () => {
  assert.match(read("app/lib/company/execution/actionTypes.ts"), /INVESTMENT_TRADE[\s\S]*R4/);
  assert.match(read("app/lib/fund/engine.ts"), /executionAuthority: "HUMAN_ONLY"/);
  assert.match(read("app/lib/fund/engine.ts"), /aiExecutionAllowed: false/);
  const contract = read("app/lib/engineering/security.ts");
  assert.match(contract, /Never push main/);
  assert.match(contract, /Never merge pull requests/);
  assert.match(contract, /Never deploy production/);
});
