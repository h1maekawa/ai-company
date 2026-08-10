import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// 何も存在しない初回起動のVaultを再現する
process.env.VAULT_ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "ai-company-content-emptyvault-"));

const DIST = process.env.CONTENT_DIST;
const noteStudioStore = await import(path.join(DIST, "content/note-studio/store.js"));
const coreStore = await import(path.join(DIST, "content/core/store.js"));
const monetizationStore = await import(path.join(DIST, "content/monetization/store.js"));
const learningStore = await import(path.join(DIST, "content/learning/store.js"));
const noteResearchStore = await import(path.join(DIST, "note/research/store.js"));

test("初回起動: article-sessions.mdが無くても例外を投げず空配列を返す", async () => {
  assert.deepEqual(await noteStudioStore.loadSessions(), []);
});

test("初回起動: content-core.mdが無くてもMaterial/Candidateは空配列", async () => {
  const file = await coreStore.loadContentCore();
  assert.deepEqual(file.materials, []);
  assert.deepEqual(file.candidates, []);
});

test("初回起動: offers.md/cta-library.md/monetization-ledger.mdが無くても安全な既定値", async () => {
  const offers = await monetizationStore.loadOffers();
  assert.deepEqual(offers.offers, []);
  assert.deepEqual(offers.campaigns, []);
  assert.deepEqual(offers.policy.allowedOfferTypes, []);

  assert.deepEqual(await monetizationStore.loadCtaLibrary(), []);

  const ledger = await monetizationStore.loadLedger();
  assert.deepEqual(ledger.conversions, []);
  assert.deepEqual(ledger.revenueEvents, []);
});

test("初回起動: learnings.md/content-recommendations.mdが無くても空配列", async () => {
  assert.deepEqual(await learningStore.loadLearnings(), []);
  assert.deepEqual(await learningStore.loadRecommendations(), []);
});

test("初回起動: 既存content-performance.md/publishing-history.mdの拡張フィールドも安全な既定値", async () => {
  const performance = await noteResearchStore.loadPerformance();
  assert.deepEqual(performance.snapshots, []);
  assert.deepEqual(await noteResearchStore.loadPublishedContent(), []);
});
