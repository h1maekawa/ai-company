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

test("every declared legacy Slack action is handled and removed actions stay absent", () => {
  const blocks = read("app/lib/integrations/slack/blocks.ts");
  const actions = read("app/api/integrations/slack/actions/route.ts");
  const names = [...blocks.matchAll(/^  ([A-Za-z0-9]+): "maemichi_/gm)].map((match) => match[1]);
  for (const name of names) assert.match(actions, new RegExp(`ACTIONS\\.${name}\\b`), name);
  assert.doesNotMatch(blocks, /selectNewsItem|maemichi_select_news_item|editText|maemichi_edit_text/);
  assert.match(actions, /case ACTIONS\.saveForLater[\s\S]*await saveForLater/);
});

test("Morning Brief cron is authenticated, scheduled at 07:00 JST and does not merge or deploy", () => {
  const route = read("app/api/cron/morning-brief/route.ts");
  assert.match(route, /verifyCronSecret/); assert.match(route, /scheduled-notification/); assert.match(route, /acquireLease/);
  assert.match(read("vercel.json"), /\/api\/cron\/morning-brief[\s\S]*0 22 \* \* \*/);
  assert.doesNotMatch(route, /merge|deploy|secret modification/i);
});
