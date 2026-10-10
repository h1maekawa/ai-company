import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

test("B1 readiness keeps Normal DailyX safety boundaries and records unknown Production truth", () => {
  const readiness = read("docs/X_PRODUCTION_READINESS.md");
  const cluster = read("app/lib/note/research/cluster.ts");
  const execution = read("app/lib/note/automation/dailyXExecution.ts");
  const sync = read("app/lib/note/automation/performanceSync.ts");

  assert.match(readiness, /CODE_READY \/ PRODUCTION_RUNTIME_UNKNOWN/);
  assert.match(cluster, /hotConfidence === "MEDIUM" \|\| candidate\.hotConfidence === "HIGH"/);
  assert.match(execution, /halt\("buffer-ambiguous"/);
  assert.match(execution, /claim-duplicate-unscheduled/);
  assert.match(sync, /getPostPublicationEvidence/);
  assert.match(sync, /getPostMetrics/);
  assert.match(sync, /reconcilePublicationPerformance/);
  assert.doesNotMatch(sync, /createPost|runOneTimeCanaryTransport|addToQueue/);
});

test("publication reconciliation preserves missing-versus-zero and never mutates a provider", () => {
  const reconciliation = read("app/lib/note/publishing/publicationPerformance.ts");
  assert.match(reconciliation, /preservedExistingMetrics/);
  assert.match(reconciliation, /metrics: null, metricsUpdatedAt: null/);
  assert.doesNotMatch(reconciliation, /createPost|deletePost|mutation|retry/);
});
