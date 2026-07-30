/**
 * 安全装置のテスト。
 * コピー検出・二重投稿防止・投稿上限・Slack署名・機械認証。
 */

import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";

const DIST = process.env.MAEMICHI_DIST;
const similarity = await import(path.join(DIST, "note/research/similarity.js"));
const queue = await import(path.join(DIST, "note/publishing/queue.js"));
const slack = await import(path.join(DIST, "integrations/slack/verify.js"));
const machineAuth = await import(path.join(DIST, "integrations/machine-auth.js"));

/* ─── 類似度 / コピー検出 ───────────────── */

const SOURCE =
  "毎朝の振り返りにChatGPTを使い始めました。質問を3つに絞ったことで、無理なく続けられるようになりました。";

test("他者の文章をそのまま使うとブロックされる", () => {
  const result = similarity.checkSimilarity(SOURCE, [{ label: "元投稿", text: SOURCE }], []);
  assert.equal(result.blocked, true);
  assert.ok(result.reason?.includes("そのまま一致"), "丸写しとして検出されること");
});

test("長い一節をそのまま含めてもブロックされる", () => {
  const text = `私の話です。${SOURCE.slice(0, 45)} という体験でした。`;
  const result = similarity.checkSimilarity(text, [{ label: "元投稿", text: SOURCE }], []);
  assert.equal(result.blocked, true);
});

test("題材が同じでも自分の言葉で書けば通る", () => {
  const text =
    "私は夜に5分だけ、その日にできたことを1つ書き留めています。увеличив質問を減らしたら気が楽になりました。";
  const result = similarity.checkSimilarity(text, [{ label: "元投稿", text: SOURCE }], []);
  assert.equal(result.blocked, false, `ブロックされないこと（score=${result.score}）`);
});

test("自分の過去投稿と重複しすぎてもブロックされる", () => {
  const past = "AIで議事録の作成を自動化した手順を、実際に試した範囲でまとめました。";
  const result = similarity.checkSimilarity(past, [], [{ label: "過去投稿", text: past }]);
  assert.equal(result.blocked, true);
});

test("無関係な文章はスコアが低い", () => {
  const result = similarity.checkSimilarity(
    "つみたてNISAの設定を見直しました",
    [{ label: "元投稿", text: SOURCE }],
    []
  );
  assert.ok(result.score < similarity.COPY_THRESHOLD);
  assert.equal(result.blocked, false);
});

/* ─── 二重投稿防止 ───────────────────── */

test("同じidempotency keyは1回しか通らない", async () => {
  const key = `test-${Date.now()}-${Math.random()}`;
  assert.equal(await queue.claimOnce(key), true, "1回目は通る");
  assert.equal(await queue.claimOnce(key), false, "2回目は弾かれる");
});

test("違うキーはそれぞれ通る", async () => {
  const a = `test-a-${Date.now()}-${Math.random()}`;
  const b = `test-b-${Date.now()}-${Math.random()}`;
  assert.equal(await queue.claimOnce(a), true);
  assert.equal(await queue.claimOnce(b), true);
});

test("ロックは同時に1つしか取れない", async () => {
  const name = `lock-${Date.now()}-${Math.random()}`;
  assert.equal(await queue.acquireLock(name), true);
  assert.equal(await queue.acquireLock(name), false, "2つ目は取れない");
  await queue.releaseLock(name);
  assert.equal(await queue.acquireLock(name), true, "解放後は取れる");
  await queue.releaseLock(name);
});

test("withLockは実行中なら null を返す", async () => {
  const name = `wl-${Date.now()}-${Math.random()}`;
  await queue.acquireLock(name);
  const result = await queue.withLock(name, async () => "実行された");
  assert.equal(result, null, "ロック中は実行されないこと");
  await queue.releaseLock(name);
});

/* ─── アフィリエイト連投防止 ───────────── */

test("直近で使ったアフィリエイトは連投できない", () => {
  const recent = ["aff1", "aff2", undefined, "aff3"];
  assert.equal(queue.affiliateCooldownOk("aff1", recent, 5), false, "直近にあるので不可");
  assert.equal(queue.affiliateCooldownOk("aff9", recent, 5), true, "使っていないものは可");
});

test("クールダウンの範囲外なら再度使える", () => {
  const recent = ["aff1", "aff2", "aff3", "aff4", "aff5", "aff6"];
  assert.equal(queue.affiliateCooldownOk("aff6", recent, 3), true, "直近3件の外なので可");
});

/* ─── 1日の投稿上限 ───────────────────── */

test("上限に達したら投稿できない", async () => {
  const check = await queue.canPublishToday("x", 0);
  assert.equal(check.allowed, false, "上限0なら常に不可");
});

test("上限内なら投稿できる", async () => {
  const check = await queue.canPublishToday("x", 9999);
  assert.equal(check.allowed, true);
});

/* ─── Slack署名検証 ───────────────────── */

const SIGNING_SECRET = "test-signing-secret";

async function sign(body, timestamp) {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(SIGNING_SECRET),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(`v0:${timestamp}:${body}`));
  return `v0=${[...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("")}`;
}

test("正しい署名は通る", async () => {
  process.env.SLACK_SIGNING_SECRET = SIGNING_SECRET;
  const body = "command=/maemichi&text=candidates";
  const ts = String(Math.floor(Date.now() / 1000));
  const result = await slack.verifySlackRequest(body, ts, await sign(body, ts));
  assert.equal(result.ok, true);
});

test("署名が違えば拒否される", async () => {
  process.env.SLACK_SIGNING_SECRET = SIGNING_SECRET;
  const ts = String(Math.floor(Date.now() / 1000));
  const result = await slack.verifySlackRequest("body", ts, "v0=deadbeef");
  assert.equal(result.ok, false);
});

test("古いリクエストは拒否される（リプレイ対策）", async () => {
  process.env.SLACK_SIGNING_SECRET = SIGNING_SECRET;
  const body = "x=1";
  const old = String(Math.floor(Date.now() / 1000) - 60 * 10);
  const result = await slack.verifySlackRequest(body, old, await sign(body, old));
  assert.equal(result.ok, false);
  assert.ok(result.reason.includes("古すぎ"));
});

test("SLACK_SIGNING_SECRET未設定なら全部拒否", async () => {
  delete process.env.SLACK_SIGNING_SECRET;
  const result = await slack.verifySlackRequest("x=1", String(Date.now() / 1000), "v0=abc");
  assert.equal(result.ok, false);
});

/* ─── 機械認証（cron / ランナー） ───────── */

function reqWith(headers = {}, url = "https://example.com/api/cron/x") {
  return new Request(url, { headers });
}

test("CRON_SECRETが未設定なら拒否する（開けっ放しにしない）", () => {
  delete process.env.CRON_SECRET;
  const result = machineAuth.verifyCronSecret(reqWith({ authorization: "Bearer whatever" }));
  assert.equal(result.ok, false);
});

test("正しいCRON_SECRETは通る", () => {
  process.env.CRON_SECRET = "cron-abc";
  assert.equal(machineAuth.verifyCronSecret(reqWith({ authorization: "Bearer cron-abc" })).ok, true);
  assert.equal(machineAuth.verifyCronSecret(reqWith({ "x-cron-secret": "cron-abc" })).ok, true);
});

test("違うCRON_SECRETは拒否される", () => {
  process.env.CRON_SECRET = "cron-abc";
  assert.equal(machineAuth.verifyCronSecret(reqWith({ authorization: "Bearer wrong" })).ok, false);
});

test("ランナートークンも同様に検証される", () => {
  delete process.env.LOCAL_RUNNER_TOKEN;
  assert.equal(machineAuth.verifyRunnerToken(reqWith({ authorization: "Bearer x" })).ok, false);

  process.env.LOCAL_RUNNER_TOKEN = "runner-xyz";
  assert.equal(machineAuth.verifyRunnerToken(reqWith({ authorization: "Bearer runner-xyz" })).ok, true);
  assert.equal(machineAuth.verifyRunnerToken(reqWith({ "x-runner-token": "runner-xyz" })).ok, true);
  assert.equal(machineAuth.verifyRunnerToken(reqWith({ authorization: "Bearer nope" })).ok, false);
});
