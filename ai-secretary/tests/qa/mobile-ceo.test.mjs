import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { buildCeoReadModel } = require(path.join(process.env.QA_DIST, "out/app/lib/mobile-ceo/readModel.js"));

test("CEO HomeはUNKNOWNを0へ変換しない", () => {
  const model = buildCeoReadModel({ approvals: null, opportunities: null, recommendations: null, engineering: { available: false, items: null } });
  assert.equal(model.metrics[0].value, null);
  assert.equal(model.creator.revenueYen, null);
  assert.equal(model.engineering.items, null);
});

test("Fund read modelは常にHuman OnlyでAI実行禁止", () => {
  const model = buildCeoReadModel({ recommendations: { recommendations: [{ id: "r1", action: "BUY_CANDIDATE", executionBlocked: false }] } });
  assert.equal(model.fund.executionAuthority, "HUMAN_ONLY");
  assert.equal(model.fund.aiExecutionAllowed, false);
});

test("Attentionは承認・Fund・Engineeringを集約する", () => {
  const model = buildCeoReadModel({ approvals: { pending: [{ id: "a1", title: "Publish" }] }, recommendations: { recommendations: [{ id: "r1", action: "WAIT_DATA" }] }, engineering: { available: true, items: [{ issueNumber: 1, title: "CI", status: "BLOCKED" }] } });
  assert.deepEqual(model.attention.map((item) => item.kind), ["approval", "fund", "engineering"]);
});
