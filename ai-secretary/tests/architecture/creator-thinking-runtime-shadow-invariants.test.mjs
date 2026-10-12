import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const dist = process.env.ARCHITECTURE_DIST;
const runtimeProjection = await import(path.join(dist, "content/creator-thinking/runtimeProjection.js"));

function basePlan(slots) {
  return {
    id: "daily-x:2026-10-13:primary",
    date: "2026-10-13",
    accountKey: "primary",
    strategySnapshot: { purposeMix: { reach: 70, noteBridge: 20, monetize: 10 }, explorationRate: 20, topicPriority: [], genrePriority: [], patternPriority: [], maxXPostsPerDay: 3 },
    slots,
    generatedAt: "2026-10-13T00:00:00.000Z",
    updatedAt: "2026-10-13T00:00:00.000Z",
  };
}

function baseSlot(overrides = {}) {
  return {
    id: "daily-x:2026-10-13:primary:0",
    slotIndex: 0,
    purpose: "reach",
    operationRole: "reach",
    bucket: "reach",
    scheduledTime: "07:30",
    scheduledAt: "2026-10-12T22:30:00.000Z",
    timeSource: "default",
    exploration: false,
    status: "scheduled",
    updatedAt: "2026-10-13T00:00:00.000Z",
    ...overrides,
  };
}

function baseDraft(overrides = {}) {
  return {
    id: "draft-1",
    planId: "daily-x:2026-10-13:primary",
    planSlotId: "daily-x:2026-10-13:primary:0",
    xAccountId: "primary",
    purpose: "reach",
    genreId: "ai",
    text: "本文",
    urls: [],
    needsDisclosure: false,
    status: "scheduled",
    createdAt: "2026-10-13T00:00:00.000Z",
    updatedAt: "2026-10-13T00:00:00.000Z",
    ...overrides,
  };
}

function activeModel(overrides = {}) {
  return {
    id: "creator-thinking-model-1",
    version: "1.0.0",
    status: "ACTIVE",
    owner: "maemichi",
    principles: [],
    aiThinkingRules: [],
    investmentProjectionRules: [],
    writingRules: [],
    contentSelectionRules: [],
    creatorFitRules: [],
    learningRules: [],
    sourceFeedbackIds: [],
    createdAt: "2026-10-01T00:00:00.000Z",
    updatedAt: "2026-10-01T00:00:00.000Z",
    ...overrides,
  };
}

/* ─── Default/compiled mode is SHADOW, with no way to flip to ACTIVE in this PR ───── */

test("CREATOR_THINKING_RUNTIME_MODEはSHADOW固定", () => {
  assert.equal(runtimeProjection.CREATOR_THINKING_RUNTIME_MODE, "SHADOW");
});

test("ソースコードにACTIVEへ切り替えるenv/フラグ分岐が存在しない", () => {
  const source = fs.readFileSync("app/lib/content/creator-thinking/runtimeProjection.ts", "utf8");
  assert.doesNotMatch(source, /process\.env/);
  assert.doesNotMatch(source, /CREATOR_THINKING_RUNTIME_MODE\s*=\s*["']ACTIVE["']/);
});

/* ─── Projection never carries publish-queue / buffer fields ───────────────────── */

test("projectionはbufferPostId/scheduledAt等のPublish Queueフィールドを一切持たない", () => {
  const plan = basePlan([baseSlot()]);
  const result = runtimeProjection.buildCreatorThinkingRuntimeProjection({
    plan,
    drafts: [baseDraft()],
    activeModel: activeModel(),
    now: new Date("2026-10-13T01:00:00.000Z"),
  });
  const keys = Object.keys(result[0]);
  for (const forbidden of ["bufferPostId", "scheduledAt", "xPostId", "text", "bufferExternalLink"]) {
    assert.ok(!keys.includes(forbidden), `projection must not include ${forbidden}`);
  }
  assert.equal(result[0].mode, "SHADOW");
  assert.equal(result[0].eligibleForSkillPromotion, false);
});

/* ─── CreatorFit is never guessed as HIGH/LOW ──────────────────────────────────── */

test("creatorFitSignalは常にNOT_EVALUATED（HIGH/LOWへ推測しない）", () => {
  const plan = basePlan([baseSlot(), baseSlot({ id: "daily-x:2026-10-13:primary:1", slotIndex: 1 })]);
  const result = runtimeProjection.buildCreatorThinkingRuntimeProjection({
    plan,
    drafts: [baseDraft()],
    activeModel: activeModel(),
    now: new Date("2026-10-13T01:00:00.000Z"),
  });
  for (const item of result) assert.equal(item.creatorFitSignal, "NOT_EVALUATED");
});

/* ─── Learning candidate promotion is always rejected under SHADOW ─────────────── */

test("isEligibleForLearningCandidateはSHADOWでもACTIVEを名乗るprojectionでも常にfalse", () => {
  assert.equal(runtimeProjection.isEligibleForLearningCandidate({ mode: "SHADOW" }), false);
  assert.equal(runtimeProjection.isEligibleForLearningCandidate({ mode: "ACTIVE" }), false);
});

/* ─── Active model lookup never fabricates a version when none is ACTIVE ──────── */

test("ACTIVEバージョンが無ければactiveCreatorThinkingModelはnullを返す（推測で埋めない）", () => {
  assert.equal(runtimeProjection.activeCreatorThinkingModel([]), null);
  assert.equal(runtimeProjection.activeCreatorThinkingModel([activeModel({ status: "DRAFT" })]), null);
  assert.equal(runtimeProjection.activeCreatorThinkingModel([activeModel()]).version, "1.0.0");
});

test("複数ACTIVE下書きがあっても該当slotのdraftIdはnull（自動選択しない）", () => {
  const plan = basePlan([baseSlot()]);
  const result = runtimeProjection.buildCreatorThinkingRuntimeProjection({
    plan,
    drafts: [baseDraft(), baseDraft({ id: "draft-2" })],
    activeModel: activeModel(),
    now: new Date("2026-10-13T01:00:00.000Z"),
  });
  assert.equal(result[0].draftId, null);
});

/* ─── No second Research/Learning/Skill/Performance store introduced ───────────── */

test("PR-XT3の新規ファイルはいずれも新規store(save/upsert)を持たない読み取り専用モジュールである", () => {
  for (const file of [
    "app/lib/content/creator-thinking/runtimeProjection.ts",
    "app/lib/content/creator-thinking/runtimeProjectionReader.ts",
  ]) {
    const source = fs.readFileSync(file, "utf8");
    assert.doesNotMatch(source, /export (async )?function save/);
    assert.doesNotMatch(source, /export (async )?function upsert/);
    assert.doesNotMatch(source, /export (async )?function append(?!GateEvidence)/);
    assert.doesNotMatch(source, /saveVaultFile/);
  }
});
