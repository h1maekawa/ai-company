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
test("recommended -> selected -> running -> validated only through confirmed linked revenue", () => {
  let o = { id: "o", status: "RECOMMENDED" };
  o = lifecycle.selectOpportunity(o);
  assert.equal(o.status, "SELECTED");
  o = lifecycle.startOpportunity(o);
  assert.equal(o.status, "RUNNING");
  assert.equal(
    lifecycle.validateOpportunityRevenue([o], [])[0].status,
    "RUNNING",
  );
  const e = {
    id: "r",
    kind: "revenue",
    opportunityId: "o",
    missionId: "m",
    confirmedByHuman: true,
    sourceType: "note",
    amountYen: 500,
  };
  assert.equal(
    lifecycle.validateOpportunityRevenue([o], [e])[0].status,
    "VALIDATED",
  );
  for (const patch of [
    { confirmedByHuman: false },
    { opportunityId: "elsewhere" },
    { sourceType: "investment" },
  ])
    assert.equal(
      lifecycle.validateOpportunityRevenue([o], [{ ...e, ...patch }])[0].status,
      "RUNNING",
    );
});
test("cannot select arbitrary lifecycle state", () => {
  assert.throws(() => lifecycle.selectOpportunity({ status: "WATCHING" }));
});
