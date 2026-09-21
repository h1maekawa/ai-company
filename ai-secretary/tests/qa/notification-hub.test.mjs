import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";

const notifications = await import(path.join(process.env.QA_DIST, "out/app/lib/notifications/events.js"));
const approval = { id: "apr-1", actionRequestId: "act-1", title: "Publish review", summary: "Check draft", riskLevel: "R2", requestedBy: "personal-note", missionId: "m1", status: "PENDING", createdAt: "2026-01-01T00:00:00.000Z" };

test("pending Approval and blocked Mission create deduplicated notification events", () => {
  const state = { approvals: [approval], actionRequests: [], missions: [], plans: [], runtime: { attention: [{ id: "a1", fingerprint: "blocked:m2", missionId: "m2", targetId: "m2", type: "MISSION_BLOCKED", priority: "high", title: "Blocked", summary: "Needs CEO", createdAt: "2026-01-02T00:00:00.000Z" }, { id: "a2", fingerprint: "blocked:m2", missionId: "m2", targetId: "m2", type: "MISSION_BLOCKED", priority: "high", title: "Blocked", summary: "Needs CEO", createdAt: "2026-01-02T00:00:00.000Z" }] } };
  const events = notifications.buildNotificationEvents(state);
  assert.equal(events.length, 2);
  assert.equal(events.find((item) => item.sourceType === "approval").deepLink, "/ceo/approvals#approval-apr-1");
  assert.equal(events.find((item) => item.sourceType === "mission").priority, "ACTION_REQUIRED");
});

test("R4 notification is urgent but never gains execution authority", () => {
  const events = notifications.buildNotificationEvents({ approvals: [{ ...approval, id: "apr-r4", riskLevel: "R4" }], actionRequests: [], missions: [], plans: [] });
  assert.equal(events[0].priority, "URGENT");
  assert.equal(events[0].actionRequired, true);
  assert.equal("aiExecutionAllowed" in events[0], false);
});

test("PR Ready, CI Failure and Engineering Blocked create actionable notifications", () => {
  const source = (id, title) => ({ id, title, url: "https://github.example/item", updatedAt: "2026-01-03T00:00:00.000Z" });
  const events = notifications.buildNotificationEvents({ approvals: [], actionRequests: [], missions: [], plans: [] }, { notificationSources: { prReady: [source("pr1", "PR Ready")], ciFailure: [source("ci1", "CI Failed")], blocked: [source("issue1", "Blocked")] } });
  assert.deepEqual(events.map((item) => item.kind).sort(), ["ENGINEERING_BLOCKED", "ENGINEERING_CI_FAILURE", "ENGINEERING_PR_READY"]);
  assert.ok(events.every((item) => item.deepLink === "/ceo/departments/engineering" && item.actionRequired));
});
