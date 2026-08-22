import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import fs from "node:fs";

const DIST = process.env.MAEMICHI_DIST;
const buffer = await import(path.join(DIST, "note/publishing/buffer.js"));

const brand = { personality: { avoidedExpressions: ["禁止表現"] } };
const baseDraft = {
  id: "draft-1", xAccountId: "x1", purpose: "reach", genreId: "ai",
  text: "安全な投稿です", urls: [], needsDisclosure: false, status: "draft",
  createdAt: "2026-08-21T00:00:00.000Z", updatedAt: "2026-08-21T00:00:00.000Z",
};
const safetyContext = { brand, experiences: [] };

function configureBuffer() {
  process.env.BUFFER_API_KEY = "test-key";
  process.env.BUFFER_ORGANIZATION_ID = "test-org";
  process.env.BUFFER_X_CHANNEL_ID = "test-channel";
}

function successResponse(data) {
  return new Response(JSON.stringify({ data }), { status: 200, headers: { "Content-Type": "application/json" } });
}

test("文字数上限内は最終Gateを通過してBuffer送信できる", async () => {
  configureBuffer();
  let calls = 0;
  const originalFetch = global.fetch;
  global.fetch = async () => {
    calls += 1;
    return successResponse({ createPost: { post: { id: "post-1", status: "draft" } } });
  };
  try {
    const result = await buffer.createPost({ draft: { ...baseDraft, text: "a".repeat(280) }, safetyContext, mode: "saveToDraft" });
    assert.equal(result.ok, true);
    assert.equal(calls, 1);
  } finally { global.fetch = originalFetch; }
});

for (const [label, mode] of [
  ["古いdraftでfailureReasonが空", "saveToDraft"],
  ["addToQueue", "addToQueue"],
  ["customScheduled", "customScheduled"],
  ["daily automationが使うcustomScheduled", "customScheduled"],
]) {
  test(`${label}でも超過ならBufferを呼ばずblockする`, async () => {
    configureBuffer();
    let calls = 0;
    const originalFetch = global.fetch;
    global.fetch = async () => { calls += 1; throw new Error("呼ばれてはいけない"); };
    const draft = { ...baseDraft, text: "a".repeat(281), failureReason: undefined };
    const snapshot = structuredClone(draft);
    try {
      const result = await buffer.createPost({ draft, safetyContext, mode, scheduledAt: "2026-08-22T03:00:00.000Z", maxScheduled: 20 });
      assert.equal(result.ok, false);
      assert.equal(result.error.kind, "validation");
      assert.match(result.error.message, /Xの文字数上限/);
      assert.equal(calls, 0);
      assert.deepEqual(draft, snapshot, "validation失敗でもdraftを変更しない");
    } finally { global.fetch = originalFetch; }
  });
}

test("既存Safety Gateのblock条件も送信直前に再評価する", async () => {
  configureBuffer();
  let calls = 0;
  const originalFetch = global.fetch;
  global.fetch = async () => { calls += 1; throw new Error("呼ばれてはいけない"); };
  try {
    const result = await buffer.createPost({ draft: { ...baseDraft, text: "禁止表現を含む投稿" }, safetyContext, mode: "saveToDraft" });
    assert.equal(result.ok, false);
    assert.match(result.error.message, /ブランド禁止表現/);
    assert.equal(calls, 0);
  } finally { global.fetch = originalFetch; }
});

test("Buffer failureでもdraft本文・statusを変更しない", async () => {
  configureBuffer();
  const originalFetch = global.fetch;
  global.fetch = async () => new Response(JSON.stringify({ errors: [{ message: "Buffer failure" }] }), {
    status: 200, headers: { "Content-Type": "application/json" },
  });
  const draft = { ...baseDraft };
  const snapshot = structuredClone(draft);
  try {
    const result = await buffer.createPost({ draft, safetyContext, mode: "saveToDraft" });
    assert.equal(result.ok, false);
    assert.deepEqual(draft, snapshot);
  } finally { global.fetch = originalFetch; }
});

for (const mode of ["saveToDraft", "addToQueue", "customScheduled"]) {
  test(`${mode}はunverified experienceだけを1回repairし、修正文を送信する`, async () => {
    configureBuffer();
    let repairCalls = 0;
    let sentText = "";
    const originalFetch = global.fetch;
    global.fetch = async (_url, init) => {
      sentText = JSON.parse(init.body).variables.input.text;
      return successResponse({ createPost: { post: { id: `post-${mode}` } } });
    };
    try {
      const result = await buffer.createPost({
        draft: {
          ...baseDraft,
          text: "投資初心者の私が調べました",
          failureReason: mode === "saveToDraft" ? "本人確認済みの根拠がない体験表現を含みます" : undefined,
        },
        safetyContext,
        mode,
        scheduledAt: mode === "customScheduled" ? "2026-08-22T03:00:00.000Z" : undefined,
        repair: async () => { repairCalls += 1; return "半導体業界の仕組みを整理しました"; },
      });
      assert.equal(result.ok, true);
      assert.equal(result.data.repaired, true);
      assert.equal(result.data.draft.text, "半導体業界の仕組みを整理しました");
      assert.equal(sentText, result.data.draft.text);
      assert.equal(repairCalls, 1);
    } finally { global.fetch = originalFetch; }
  });
}

test("repair後も最終Gateを再実行し、未確認体験が残れば送信しない", async () => {
  configureBuffer();
  let fetchCalls = 0;
  const originalFetch = global.fetch;
  global.fetch = async () => { fetchCalls += 1; throw new Error("呼ばれてはいけない"); };
  try {
    const result = await buffer.createPost({
      draft: { ...baseDraft, text: "私が調べました" }, safetyContext, mode: "saveToDraft",
      repair: async () => "私が改めて調べました",
    });
    assert.equal(result.ok, false);
    assert.match(result.error.message, /本人確認済み/);
    assert.equal(fetchCalls, 0);
  } finally { global.fetch = originalFetch; }
});

for (const [label, patch, reason] of [
  ["secretとの複合違反", { text: "私が試した secret=abc" }, /機密情報/],
  ["personal data", { text: "連絡先は test@example.com です" }, /個人情報/],
  ["similarity violation", { text: "安全な投稿です", similarityScore: 0.9 }, /類似度/],
  ["280超", { text: `私が${"a".repeat(280)}` }, /文字数上限/],
]) {
  test(`${label}はrepair対象にしない`, async () => {
    let repairCalls = 0;
    const result = await buffer.createPost({
      draft: { ...baseDraft, ...patch }, safetyContext, mode: "saveToDraft",
      repair: async () => { repairCalls += 1; return "修正"; },
    });
    assert.equal(result.ok, false);
    assert.match(result.error.message, reason);
    assert.equal(repairCalls, 0);
  });
}

test("repairが新しいfactual tokenを追加した場合は拒否する", async () => {
  const result = await buffer.createPost({
    draft: { ...baseDraft, text: "私が調べました" }, safetyContext, mode: "saveToDraft",
    repair: async () => "市場は42%成長すると整理しました",
  });
  assert.equal(result.ok, false);
  assert.match(result.error.message, /本人確認済み/);
});

test("手動APIはidempotency消費前にprepareし、成功時だけ修正文を保存する", () => {
  const route = fs.readFileSync(path.join(process.cwd(), "app/api/note/publishing/buffer/route.ts"), "utf8");
  assert.ok(route.indexOf("prepareXDraftForPublishing") < route.indexOf("claimOnce(key)"));
  assert.match(route, /text: result\.data\.draft\.text/);
  assert.match(route, /if \(!result\.ok\)[\s\S]*?return NextResponse\.json[\s\S]*?saveSocialDrafts/);
  assert.match(route, /repaired: prepared\.repaired \|\| result\.data\.repaired/);
});

test("dailyXとBuffer最終境界は共通prepareを使う", () => {
  const daily = fs.readFileSync(path.join(process.cwd(), "app/lib/note/automation/dailyX.ts"), "utf8");
  const publishing = fs.readFileSync(path.join(process.cwd(), "app/lib/note/publishing/buffer.ts"), "utf8");
  assert.match(daily, /prepareXDraftForPublishing/);
  assert.match(publishing, /prepareXDraftForPublishing/);
  assert.doesNotMatch(daily, /repairUnverifiedExperience/);
});
