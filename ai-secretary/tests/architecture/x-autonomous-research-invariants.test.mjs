import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

test("B1.5 reuses canonical Research, Hot filter, and existing publish path", () => {
  const platform = read("app/lib/company/research/platform.ts");
  const daily = read("app/lib/note/automation/dailyX.ts");
  const plan = read("app/lib/note/automation/dailyXPlan.ts");
  assert.match(platform, /agenda\?\.queryIntents/);
  assert.match(platform, /slice\(0,input\.policy\.maxQueriesPerRun\)/);
  assert.match(daily, /filterHotConfidenceCandidates/);
  assert.match(daily, /evaluatePublishEligibility/);
  assert.match(daily, /createPost/);
  assert.match(plan, /orderCandidatesForSlot/);
  assert.doesNotMatch(plan, /newHotScore|autonomousRankScore/);
});

test("B1.5 preserves Buffer ambiguous no-resend and does not mutate schedule policy", () => {
  const execution = read("app/lib/note/automation/dailyXExecution.ts");
  const operations = read("app/lib/note/operations.ts");
  const agenda = read("app/lib/note/automation/dailyResearchAgenda.ts");
  assert.match(execution, /halt\("buffer-ambiguous"/);
  assert.match(operations, /"07:30"[\s\S]*"12:15"[\s\S]*"20:30"/);
  assert.match(operations, /operationRole: "depth"/);
  assert.doesNotMatch(agenda, /saveResearchSettings|improveStrategy|createPost|publish/);
});

test("B1.5 Learning produces candidates without mutating Strategy Policy", () => {
  const nightly = read("app/lib/note/automation/nightlyGrowthReview.ts");
  assert.match(nightly, /strategyCandidateAvailable/);
  assert.match(nightly, /const strategyChanged = false/);
  assert.doesNotMatch(nightly, /saveResearchSettings/);
  assert.match(nightly, /review.strategyApplied = false/);
  const report = read("app/lib/note/automation/weeklyReport.ts");
  assert.match(report, /filter\(\(r\) => r.strategyApplied === true\)/);
  assert.match(report, /Strategy変更候補/);
});
