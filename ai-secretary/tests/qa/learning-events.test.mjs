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
test("learning events are appended, deduplicated and retain rejection evidence", () => {
  const s = fixture();
  learning.recordLearning(s, "APPROVAL_REJECTED", "1", {
    missionId: "m",
    reason: "reason",
    originalProposal: "original",
    actionType: "PUBLISH",
  });
  const original = structuredClone(s.runtime.learning[0]);
  learning.recordLearning(s, "APPROVAL_REJECTED", "1", { reason: "overwrite" });
  learning.recordLearning(s, "REVIEW_FAILED", "2", { missionId: "m" });
  assert.equal(s.runtime.learning.length, 2);
  assert.deepEqual(s.runtime.learning[0], original);
  assert.equal(original.traceId, "t");
});
