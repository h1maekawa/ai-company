import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";

const manual = await import(path.join(process.env.QA_DIST, "out/app/lib/company/execution/manualMission.js"));

test("CEO Manual Mission input is trimmed and bounded", () => {
  assert.equal(manual.validateManualMissionInput({ title: " ", description: "目的" }).error, "TITLE_REQUIRED");
  assert.equal(manual.validateManualMissionInput({ title: "x".repeat(121), description: "目的" }).error, "TITLE_TOO_LONG");
  assert.equal(manual.validateManualMissionInput({ title: "内部調査", description: " " }).error, "DESCRIPTION_REQUIRED");
  assert.equal(manual.validateManualMissionInput({ title: "内部調査", description: "x".repeat(2001) }).error, "DESCRIPTION_TOO_LONG");
  assert.deepEqual(manual.validateManualMissionInput({ title: " 内部調査 ", description: " 報告作成 " }), { ok: true, title: "内部調査", description: "報告作成" });
});

test("create produces one auditable PLANNED internal Mission without execution", () => {
  const mission = manual.createManualMissionRecord({ id: "mission_manual_test", title: "内部調査", description: "内部レポートを作る", now: new Date("2026-09-14T00:00:00Z") });
  assert.equal(mission.status, "PLANNED");
  assert.equal(mission.source, "CEO_MANUAL");
  assert.equal(mission.origin, "human");
  assert.equal(mission.createdBy, "ceo");
  assert.equal(mission.executionPlanId, undefined);
  assert.deepEqual(mission.actionRequestIds, []);
});
