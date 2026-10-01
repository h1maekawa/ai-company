import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const read = (file) => readFileSync(file, "utf8");

test("Slack memory stays behind signature/DM/dedupe gates and inside background ACK", () => {
  const route = read("app/api/integrations/slack/events/route.ts");
  const start = route.indexOf("export async function POST");
  const body = route.slice(start);
  const tokens = ["verifySlackRequest(", "isSupportedSlackDirectMessage(", "await claimOnce(", "runInBackground(", "withSlackConversationMemory("];
  const offsets = tokens.map((token) => body.indexOf(token));
  assert.ok(offsets.every((offset) => offset >= 0));
  assert.deepEqual(offsets, [...offsets].sort((a, b) => a - b));
  assert.doesNotMatch(body.slice(0, body.indexOf("runInBackground(")), /await (?:withSlackConversationMemory|recordOperation)/);
});

test("Home only reports exhausted memory jobs and cron drain is authenticated", () => {
  const home = read("app/api/company/home-summary/route.ts");
  assert.match(home, /job.status === "failed" && job.attempts >= 3/);
  assert.match(home, /slack-memory-failed/);
  const cron = read("app/api/cron/personal-company-runtime/route.ts");
  const body = cron.slice(cron.indexOf("export async function GET"));
  assert.ok(body.indexOf("verifyCronSecret") < body.indexOf("runInBackground(drainSlackMemoryJobs"));
  assert.ok(body.indexOf("VERCEL_PRODUCTION_AUTHORITY_REQUIRED") < body.indexOf("runInBackground(drainSlackMemoryJobs"));
});

test("memory promotion cannot execute actions, bypass Knowledge capture or index raw", () => {
  const promotion = read("app/lib/integrations/slack/memory/promotion.ts");
  assert.match(promotion, /captureKnowledgeCandidate/);
  assert.match(promotion, /approvalStatus: "pending"/);
  assert.doesNotMatch(promotion, /executeAction|createMission|promoteToKnowledge|indexKnowledgePathBestEffort/);
  assert.match(read("app/lib/knowledge/indexSync.ts"), /path.startsWith\("memory\/knowledge\/"\)/);
});
