import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read = (file) => fs.readFileSync(file, "utf8");

test("Manual Mission has one protected create route and reuses execution services", () => {
  const create = read("app/api/company/missions/manual/route.ts");
  const start = read("app/api/company/missions/[id]/start/route.ts");
  const run = read("app/api/company/missions/[id]/run/route.ts");
  assert.match(create, /createManualMission/);
  assert.match(create, /isSameOriginMutation/);
  assert.match(create, /idempotency-key/);
  assert.match(start, /startMission/);
  assert.match(start, /isSameOriginMutation/);
  assert.doesNotMatch(start, /body\.mission/);
  assert.match(run, /runMission/);
  assert.match(run, /isSameOriginMutation/);
});

test("Manual Mission path is internal-only and cannot introduce an external executor", () => {
  const manual = read("app/lib/company/execution/manualMission.ts");
  const service = read("app/lib/company/execution/service.ts");
  assert.match(manual, /status: "PLANNED"/);
  assert.match(manual, /source: "CEO_MANUAL"/);
  assert.match(manual, /origin: "human"/);
  assert.match(service, /manual-mission-create/);
  assert.doesNotMatch(manual, /EMAIL_DRAFT|GMAIL_SEND|PUBLISH_DRAFT|CALENDAR_WRITE|GITHUB_WRITE|PAYMENT|AD_SPEND|INVESTMENT_TRADE|CREDENTIAL_CHANGE|PROTECTED_CORE_MUTATION|BULK_DELETE/);
});

test("Manual Mission UI creates separately from Start and Run", () => {
  const ui = read("components/company/MissionExecutionPanel.tsx");
  assert.match(ui, /CEO Manual Mission/);
  assert.match(ui, /\/api\/company\/missions\/manual/);
  assert.match(ui, /Missionを作成/);
  assert.match(ui, /開始/);
  assert.match(ui, /Run \/ 再開/);
  assert.match(ui, /maxLength=\{120\}/);
  assert.match(ui, /maxLength=\{2000\}/);
});
