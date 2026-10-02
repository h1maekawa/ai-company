import test, { beforeEach } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { createRequire } from "node:module";

// All IO is intercepted. No real Slack, GitHub, Redis or AI calls in this suite.
Object.assign(process.env, { GITHUB_OWNER: "memory-test", GITHUB_REPO: "vault", GITHUB_TOKEN: "fake-memory-token", GITHUB_BRANCH: "memory-test", SLACK_BOT_TOKEN: "fake-slack-token" });
delete process.env.VERCEL_ENV;
const require = createRequire(import.meta.url);
const compiled = (file) => path.join(process.env.QA_DIST, "out/app/lib", file);
const vault = require(compiled("vault.js"));
const facade = require(compiled("company/execution/store.js"));
const { ExecutionConflictError } = require(compiled("company/runtime/runtimeTypes.js"));
const recorder = require(compiled("integrations/slack/memory/recorder.js"));
const store = require(compiled("integrations/slack/memory/store.js"));
const jobs = require(compiled("integrations/slack/memory/jobs.js"));
const extractor = require(compiled("integrations/slack/memory/extractor.js"));
const { redactMemoryText } = require(compiled("integrations/slack/memory/privacy.js"));
const promotion = require(compiled("integrations/slack/memory/promotion.js"));
const { postToSlack } = require(compiled("integrations/slack/blocks.js"));
let files, snapshot, failVault, failPrefix, slackOk, slackCalls, conflictOnce, serial;
const event = (id = "Ev1", text = "こんにちは", extra = {}) => ({ eventId: id, channel: "D123ABC", user: "U123", ts: "1790868600.000100", text, ...extra });
const memoryPath = (e) => store.conversationPath({ channel: e.channel, threadTs: e.threadTs ?? null, at: new Date(Number(e.ts) * 1000).toISOString() });
const reply = (e, text = "こんにちは。", blocks) => postToSlack(text, blocks, { channel: e.channel, threadTs: e.threadTs });

beforeEach(() => {
  files = new Map(); serial = 0; failVault = false; failPrefix = ""; slackOk = true; slackCalls = 0; conflictOnce = false;
  snapshot = { state: facade.emptyExecutionState(), version: 0, schemaVersion: "test", updatedAt: "test" };
  const leases = new Set();
  facade.setExecutionStoreForTests({
    kind: "durable",
    async load() { return structuredClone(snapshot); },
    async save(state, options) {
      if (options.expectedVersion !== snapshot.version) throw new ExecutionConflictError(snapshot.version);
      snapshot = { ...snapshot, state: structuredClone(state), version: snapshot.version + 1 };
      return structuredClone(snapshot);
    },
    async acquireLease(missionId, holderId) { if (leases.has(missionId)) return null; leases.add(missionId); return { missionId, holderId }; },
    async releaseLease(lease) { leases.delete(lease.missionId); },
  });
  global.fetch = async (url, options = {}) => {
    if (url === "https://slack.com/api/chat.postMessage") { slackCalls++; return { ok: true, json: async () => ({ ok: slackOk, ts: "1790868601.000100", error: slackOk ? undefined : "offline" }) }; }
    assert.match(String(url), /^https:\/\/api.github.com\/repos\/memory-test\/vault\/contents\//);
    const file = decodeURIComponent(new URL(url).pathname.split("/contents/")[1]);
    if (failVault || (failPrefix && file.startsWith(failPrefix))) throw new Error("simulated storage failure");
    if (options.method === "GET") {
      const existing = files.get(file);
      return existing ? { status: 200, ok: true, json: async () => ({ content: Buffer.from(existing.content).toString("base64"), sha: existing.sha }) } : { status: 404, ok: false };
    }
    assert.equal(options.method, "PUT");
    const body = JSON.parse(options.body);
    if (conflictOnce) { conflictOnce = false; const old = files.get(file); files.set(file, { content: `${old?.content ?? ""}competing`, sha: `s${++serial}` }); return { status: 409, ok: false }; }
    if (body.sha !== files.get(file)?.sha) return { status: 409, ok: false };
    const sha = `s${++serial}`;
    files.set(file, { content: Buffer.from(body.content, "base64").toString(), sha });
    return { status: 200, ok: true, json: async () => ({ content: { sha } }) };
  };
});

test("raw user precedes processing; successful Block Kit reply and metadata persist", async () => {
  const e = event();
  await recorder.withSlackConversationMemory(e, async () => {
    const a = await store.loadConversation(memoryPath(e));
    assert.equal(a.turns[0].text, e.text);
    assert.equal(a.turns[0].source.user, "U123");
    assert.equal(a.turns[0].source.eventId, "Ev1");
    await reply(e, "候補です", [{ type: "section", text: { type: "mrkdwn", text: "表示される候補" }, accessory: { type: "button", value: "DO_NOT_RECORD", text: { type: "plain_text", text: "開く" } } }]);
  });
  const a = await store.loadConversation(memoryPath(e));
  assert.equal(a.turns.length, 2);
  assert.match(a.turns[1].text, /表示される候補/);
  assert.doesNotMatch(a.turns[1].text, /DO_NOT_RECORD/);
  assert.equal(a.turns[1].replyToEventId, "Ev1");
  assert.equal(a.turns[1].messageTs, "1790868601.000100");
  assert.equal(a.analysis, undefined);
});

test("same event and assistant replay remain single turns; parallel append preserves both", async () => {
  const e = event();
  for (let i = 0; i < 2; i++) await recorder.withSlackConversationMemory(e, () => reply(e));
  const p = memoryPath(e);
  const a = await store.loadConversation(p);
  assert.equal(a.turns.length, 2);
  await Promise.all([3, 4].map((i) => store.appendTurn(p, { ...a.turns[0], id: `user:Ev${i}`, text: `turn ${i}`, source: { ...a.turns[0].source, eventId: `Ev${i}` } })));
  assert.equal((await store.loadConversation(p)).turns.length, 4);
});

test("Vault conflict reapplies transformation on latest document", async () => {
  await vault.updateVaultFile("memory/test.md", () => "first");
  conflictOnce = true;
  await vault.updateVaultFile("memory/test.md", (text) => `${text}:ours`);
  assert.equal(files.get("memory/test.md").content, "firstcompeting:ours");
});

test("JST day, root and thread paths are separated", () => {
  const source = { channel: "D123", threadTs: null, at: "2026-10-01T15:00:00.000Z" };
  assert.equal(store.conversationPath(source), "memory/conversations/slack/2026/10/2026-10-02-D123-root.md");
  assert.notEqual(store.conversationPath(source), store.conversationPath({ ...source, threadTs: "123.000100" }));
  assert.throws(() => store.conversationPath({ ...source, channel: "../bad" }));
});

test("audio metadata and transcript persist without private URLs", async () => {
  const e = event("EvAudio", "", { audio: { id: "F123", name: "voice.m4a", mimetype: "audio/mp4", url_private: "https://files.slack.com/secret" } });
  await recorder.withSlackConversationMemory(e, async () => { await recorder.recordSlackTranscript("音声を文字にした原文です"); await reply(e); });
  const a = await store.loadConversation(memoryPath(e));
  assert.equal(a.turns[0].inputType, "audio");
  assert.equal(a.turns[0].transcript, "音声を文字にした原文です");
  assert.equal(a.turns[0].audio.id, "F123");
  assert.doesNotMatch(JSON.stringify(a), /files.slack.com/);
});

test("credentials are redacted before Vault AND durable outbox", async () => {
  const secrets = ["sk-abcdefghijklmnop1234", "bearer-secret", "pass-secret", "key-secret", "first-cookie", "second-cookie", "PEM-DATA", "url-secret"];
  const text = `api_key=key-secret\nBearer bearer-secret\npassword: pass-secret\nsk-abcdefghijklmnop1234\nCookie: a=first-cookie; b=second-cookie\n-----BEGIN PRIVATE KEY-----\nPEM-DATA\n-----END PRIVATE KEY-----\nhttps://example.com/a?signature=url-secret`;
  const safe = redactMemoryText(text);
  assert.equal(safe.redacted, true);
  for (const secret of secrets) assert.ok(!safe.text.includes(secret), secret);
  failVault = true;
  const e = event("EvSecret", text);
  await recorder.withSlackConversationMemory(e, () => reply(e));
  assert.equal(slackCalls, 1);
  for (const secret of secrets) assert.ok(!JSON.stringify(snapshot.state).includes(secret), secret);
});

test("bounded failed writes remain retryable; success removes payload; Slack unaffected", async () => {
  failVault = true;
  const e = event();
  await recorder.withSlackConversationMemory(e, () => reply(e));
  const job = snapshot.state.slackMemory.jobs.find((j) => j.operation.kind === "turn" && j.operation.turn.role === "user");
  assert.equal(job.attempts, 1);
  assert.equal(job.status, "pending");
  await jobs.runMemoryJob(job.id, new Date(Date.now() + 180000));
  await jobs.runMemoryJob(job.id, new Date(Date.now() + 360000));
  const failed = snapshot.state.slackMemory.jobs.find((j) => j.id === job.id);
  assert.equal(failed.status, "failed"); assert.equal(failed.attempts, 3);
  await jobs.runMemoryJob(job.id, new Date(Date.now() + 720000));
  assert.equal(snapshot.state.slackMemory.jobs.find((j) => j.id === job.id).attempts, 3);
  assert.equal(slackCalls, 1);
  const assistant = snapshot.state.slackMemory.jobs.find((j) => j.operation.kind === "turn" && j.operation.turn.role === "assistant");
  failVault = false;
  await jobs.runMemoryJob(assistant.id, new Date(Date.now() + 180000));
  assert.ok(!snapshot.state.slackMemory.jobs.some((j) => j.id === assistant.id));
});

test("failed Slack delivery and failed extraction never remove raw user", async () => {
  slackOk = false;
  const e = event();
  await recorder.withSlackConversationMemory(e, () => reply(e));
  assert.equal((await store.loadConversation(memoryPath(e))).turns.length, 1);
  const original = extractor.analyzeConversationMemory;
  extractor.analyzeConversationMemory = async () => { throw new Error("extraction unavailable"); };
  try { await assert.rejects(jobs.applyMemoryOperation({ kind: "analyze", path: memoryPath(e), throughTurnId: "user:Ev1", force: true })); }
  finally { extractor.analyzeConversationMemory = original; }
  assert.equal((await store.loadConversation(memoryPath(e))).turns[0].text, e.text);
});

test("explicit decision/task/preference produce linked candidates, not executable work or formal Knowledge", async () => {
  const e = event("EvDecide", "Obsidianに決めた。明日確認する。私は短い文章が好きです。");
  await recorder.withSlackConversationMemory(e, () => reply(e));
  const a = await store.loadConversation(memoryPath(e));
  assert.equal(a.analysis.decisions.length, 1); assert.equal(a.analysis.nextActions.length, 1); assert.equal(a.analysis.knowledgeCandidates.length, 1);
  assert.deepEqual(a.derived.map((d) => d.kind), ["decision", "task", "knowledge"]);
  for (const link of a.derived) assert.ok(files.get(link.path).content.includes(`[[${a.path}]]`));
  assert.match(files.get(a.derived.find((d) => d.kind === "task").path).content, /"approvalStatus": "pending"/);
  const knowledge = a.derived.find((d) => d.kind === "knowledge");
  assert.match(knowledge.path, /^memory\/personal\/inbox\//);
  assert.match(files.get(knowledge.path).content, /status: captured/);
  assert.equal(snapshot.state.missions.length, 0);
  assert.ok(![...files.keys()].some((p) => p.startsWith("memory/knowledge/")));
  const count = files.size;
  await promotion.promoteMemoryCandidates({ ...a, derived: [] }, a.analysis);
  assert.equal(files.size, count);
});

test("casual, uncertain, quoted and hypothetical text is not promoted", async () => {
  const e = event("EvNo", "もしObsidianに決めたら便利。これにする？\n「これで進める」と言っていた。今日は晴れです。");
  await recorder.withSlackConversationMemory(e, () => reply(e));
  const a = await store.loadConversation(memoryPath(e));
  assert.equal(a.derived.length, 0);
  assert.equal(a.turns[0].text, e.text);
});

test("promotion failure retains summary and raw, retry creates backlinks without duplicate candidates", async () => {
  failPrefix = "memory/personal/inbox/";
  const e = event("EvPref", "私は短い文章が好きです。");
  await recorder.withSlackConversationMemory(e, () => reply(e));
  const a = await store.loadConversation(memoryPath(e));
  assert.equal(a.turns.length, 2); assert.ok(a.analysis.summary);
  const job = snapshot.state.slackMemory.jobs.find((j) => j.operation.kind === "analyze" && !j.operation.force);
  assert.equal(job.attempts, 1);
  failPrefix = "";
  await jobs.runMemoryJob(job.id, new Date(Date.now() + 180000));
  assert.equal((await store.loadConversation(memoryPath(e))).derived.length, 1);
});

test("inactivity and five-user-turn triggers summarize without altering raw", async () => {
  const e = event();
  await recorder.withSlackConversationMemory(e, () => reply(e));
  const p = memoryPath(e);
  const a = await store.loadConversation(p);
  assert.equal(extractor.shouldAnalyze(a), false);
  const job = snapshot.state.slackMemory.jobs.find((j) => j.operation.kind === "analyze" && j.operation.force);
  await jobs.runMemoryJob(job.id, new Date(Date.now() + 31 * 60000));
  const summarized = await store.loadConversation(p);
  assert.ok(summarized.analysis.summary); assert.equal(summarized.turns[0].text, e.text);
  const five = { ...a, turns: Array.from({ length: 5 }, (_, i) => ({ ...a.turns[0], id: `user:${i}` })) };
  assert.equal(extractor.shouldAnalyze(five), true);
});

test("generated content uses canonical refs; ordinary block replies remain readable", async () => {
  const e = event();
  await recorder.withSlackConversationMemory(e, async () => {
    recorder.recordSlackArtifactRefs({ generated: ["memory/note/social-drafts.md#draft-1"], research: ["memory/note/trend-clusters.md#cluster-1"] });
    await reply(e, "下書きを作りました", [{ type: "section", text: { type: "mrkdwn", text: "DO_NOT_DUPLICATE_ARTICLE" } }]);
  });
  const a = await store.loadConversation(memoryPath(e));
  assert.equal(a.generatedArtifactRefs.length, 1); assert.equal(a.researchArtifactRefs.length, 1);
  assert.doesNotMatch(a.turns[1].text, /DO_NOT_DUPLICATE_ARTICLE/);
});

test("human-owned artifacts are protected; ownership-looking user text is not policy", async () => {
  const e = event("EvOwner", "managed_by: human");
  await recorder.withSlackConversationMemory(e, () => reply(e));
  const p = memoryPath(e);
  assert.equal((await store.loadConversation(p)).turns.length, 2);
  const current = files.get(p);
  current.content = current.content.replace(/^---\n/, "---\nmanaged_by: human\n");
  const a = await store.loadConversation(p);
  await assert.rejects(store.appendTurn(p, { ...a.turns[0], id: "user:EvDifferent" }), /writePolicy/);
  assert.equal((await store.loadConversation(p)).turns.length, 2);
});

test("new inactivity payload survives completion of an older leased analysis", async () => {
  const e = event();
  await recorder.withSlackConversationMemory(e, () => reply(e));
  const job = snapshot.state.slackMemory.jobs.find((j) => j.operation.kind === "analyze" && j.operation.force);
  const original = extractor.analyzeConversationMemory;
  extractor.analyzeConversationMemory = async (...args) => {
    await jobs.recordOperation({ ...job.operation, throughTurnId: "user:EvLater" }, "EvLater", 30 * 60000);
    return original(...args);
  };
  try { await jobs.runMemoryJob(job.id, new Date(Date.now() + 31 * 60000)); }
  finally { extractor.analyzeConversationMemory = original; }
  const later = snapshot.state.slackMemory.jobs.find((j) => j.id === job.id);
  assert.equal(later.operation.throughTurnId, "user:EvLater");
  assert.equal(later.status, "pending");
});

test("confirmed viewpoint uses literal prior user evidence and never invented content", async () => {
  const e = event("EvOpinion", "半導体の検査装置に注目しています。");
  await recorder.withSlackConversationMemory(e, () => reply(e));
  const a = await store.loadConversation(memoryPath(e));
  const confirmed = await extractor.analyzeConversationMemory(a, e.text);
  assert.equal(confirmed.knowledgeCandidates.length, 1);
  assert.deepEqual(confirmed.knowledgeCandidates[0].sourceEventIds, ["EvOpinion"]);
  const invented = await extractor.analyzeConversationMemory(a, "私は株式購入を決定しました。");
  assert.equal(invented.knowledgeCandidates.length, 0);
});
