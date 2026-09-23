import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const read = (p) => fs.readFileSync(path.join(root, p), "utf8");
const route = read("app/api/note/maintenance/draft-cleanup/route.ts");

test("X draft cleanup mutation requires human confirmation, same origin, idempotency and the dry-run plan", () => {
  assert.match(route, /isSameOriginMutation/);
  assert.match(route, /idempotency-key/);
  assert.match(route, /confirmedByHuman !== true[\s\S]*HUMAN_CONFIRMATION_REQUIRED/);
  assert.match(route, /plan\.planId !== body\.planId/);
  assert.match(route, /export async function GET[\s\S]*dryRun: true/);
});

test("X draft cleanup only touches SocialDraft[] and never cancels Buffer or edits history", () => {
  assert.match(route, /withLock\("daily-x-publish"/);
  assert.match(route, /bufferCancelled: false/);
  for (const forbidden of [/buffer\/client|deleteBufferPost|cancel.*Buffer\(/i, /savePublishingHistory|saveResearchInbox|saveClusters|savePerformance|saveGrowthReviews|saveRevenue/, /saveExecutionState/]) assert.doesNotMatch(route, forbidden);
  assert.doesNotMatch(route, /console\.[a-z]+\([^)]*\.text/, "must not log draft bodies");
  const lib = read("app/lib/note/maintenance/draftCleanup.ts");
  assert.match(lib, /CLEANUP_TARGET_STATUSES: readonly SocialDraftStatus\[\] = \["draft", "approved", "failed", "discarded"\]/);
});

test("X Daily Automation, Safety Gates and publishing semantics are untouched by the cleanup", () => {
  assert.doesNotMatch(route, /X_DAILY_AUTOMATION_ENABLED|publishingEnabled|xAutoPublish|socialOperationMode/);
});
