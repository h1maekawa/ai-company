import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read = (path) => fs.readFileSync(path, "utf8");

test("one-time Canaryは認証済み明示POSTだけで、通常Hot filterやCron scheduleに組み込まれない", () => {
  const browserRoute = read("app/api/note/automation/one-time-canary/route.ts");
  const cronRoute = read("app/api/cron/x-one-time-canary-transport/route.ts");
  const daily = read("app/lib/note/automation/dailyX.ts");
  const config = read("vercel.json");
  assert.match(browserRoute, /isSameOriginMutation\(req\)/);
  assert.match(browserRoute, /verifySessionToken\(/);
  assert.match(cronRoute, /verifyCronSecret\(request\)/);
  assert.match(browserRoute, /runOneTimeCanaryTransport/);
  assert.match(daily, /filterHotConfidenceCandidates\(eligible\)/);
  assert.match(daily, /claimStrict\("one-time-x-canary-transport-v1"/);
  assert.doesNotMatch(config, /x-one-time-canary-transport/);
});

test("Canary本文は内部Brandテンプレートのみで外部Researchや投資Bridgeを使わない", () => {
  const canary = read("app/lib/note/automation/oneTimeTransportCanary.ts");
  assert.match(canary, /BRAND_ONLY_TEXTS/);
  assert.match(canary, /checkSimilarity\(/);
  assert.match(canary, /checkNumbersAgainstSources\(/);
  assert.match(canary, /runXSafetyGate\(/);
  assert.doesNotMatch(canary, /tryGenerateInvestmentDraft|generateXPosts|fetch\(/);
});

test("Canary reconciliationはPublication EvidenceとMetricsを分離し再送経路を持たない", () => {
  const buffer = read("app/lib/note/publishing/buffer.ts");
  const sync = read("app/lib/note/automation/performanceSync.ts");
  const publicationQuery = buffer.match(/query PostPublicationEvidence[\s\S]*?\n\s*}`,[\s\S]*?postId/);
  assert.ok(publicationQuery);
  assert.doesNotMatch(publicationQuery[0], /metrics(?:UpdatedAt)?/);
  assert.match(sync, /getPostPublicationEvidence/);
  assert.match(sync, /getPostMetrics/);
  assert.ok(sync.indexOf("publicationEvidenceFetcher") < sync.indexOf("postMetricsFetcher(draft.bufferPostId)"));
  assert.match(sync, /AMBIGUOUS_DUPLICATE_LINEAGE/);
  assert.doesNotMatch(sync, /createPost|runOneTimeCanaryTransport|addToQueue|customScheduled/);
});
