import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";

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
