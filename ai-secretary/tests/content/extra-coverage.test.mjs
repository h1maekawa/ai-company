import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

process.env.VAULT_ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "ai-company-content-extra-"));

const DIST = process.env.CONTENT_DIST;
const monetizationStore = await import(path.join(DIST, "content/monetization/store.js"));
const monetizationTypes = await import(path.join(DIST, "content/monetization/types.js"));
const learningEngine = await import(path.join(DIST, "content/learning/engine.js"));
const learningTypes = await import(path.join(DIST, "content/learning/types.js"));
const obsidian = await import(path.join(DIST, "content/core/providers/obsidian.js"));
const vault = await import(path.join(DIST, "vault.js"));

test("Campaign CRUD: 作成・更新・一覧取得が往復する", async () => {
  const file = await monetizationStore.loadOffers();
  const campaign = {
    id: "camp_test",
    name: "DAYLOOP公開Campaign",
    goal: "DAYLOOPの認知拡大",
    offerIds: [],
    contentIds: [],
    status: "draft",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  await monetizationStore.saveOffers({ ...file, campaigns: [campaign, ...file.campaigns] });

  const loaded = await monetizationStore.loadOffers();
  const found = loaded.campaigns.find((c) => c.id === "camp_test");
  assert.equal(found.name, "DAYLOOP公開Campaign");

  const updated = { ...found, status: "active" };
  await monetizationStore.saveOffers({ ...loaded, campaigns: loaded.campaigns.map((c) => (c.id === found.id ? updated : c)) });
  const final = await monetizationStore.loadOffers();
  assert.equal(final.campaigns.find((c) => c.id === "camp_test").status, "active");
});

test("Affiliate disclosure: 既定ポリシーは広告表記が空でない（AIが隠す余地を残さない）", () => {
  const policy = monetizationTypes.defaultMonetizationPolicy();
  assert.ok(policy.affiliateDisclosure.length > 0);
});

test("Recommendation → X: channel:'x'でも承認済みLearningから提案が作れる", () => {
  const learning = learningTypes.approveLearning(
    learningTypes.createLearningCandidate({
      period: "2026-W32",
      sourceContentIds: [],
      sourcePerformanceIds: [],
      observation: "体験型X投稿はHow-toよりCTRが高かった",
      interpretation: "体験ベースの方が反応が良い可能性",
      actionCandidate: "体験型のXを2本テスト",
    })
  );
  const recs = learningEngine.generateRecommendationsFromLearnings([learning], { channel: "x" });
  assert.equal(recs.length, 1);
  assert.equal(recs[0].channel, "x");
});

test("Recommendation: 未承認（candidate）のLearningからは生成しない", () => {
  const candidateOnly = learningTypes.createLearningCandidate({
    period: "2026-W32",
    sourceContentIds: [],
    sourcePerformanceIds: [],
    observation: "obs",
    interpretation: "interp",
    actionCandidate: "action",
  });
  const recs = learningEngine.generateRecommendationsFromLearnings([candidateOnly]);
  assert.equal(recs.length, 0, "本人承認前のLearningから次の投稿候補を作らない");
});

test("Obsidian Material: 既存Vaultファイルをcopyで取り込み、元ファイルは変更しない", async () => {
  const relPath = "memory/personal/note/idea-inbox.md";
  const original = "---\ntype: note_idea_inbox\n---\n\n# ネタ帳\n";
  await vault.saveVaultFile(relPath, original);

  const material = await obsidian.ObsidianContentProvider.importMaterial(relPath);
  assert.equal(material.sourceType, "obsidian");
  assert.equal(material.sourceId, relPath);
  assert.equal(material.rawContent, original);

  const stillThere = (await vault.getVaultFile(relPath)).content;
  assert.equal(stillThere, original, "取り込み元のVaultファイルは変更されない（copyのみ）");
});
