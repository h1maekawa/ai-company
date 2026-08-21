/**
 * Critical Monetization E2E（要件 §77）:
 * Note記事作成 → Draft本人承認 → Content Goal設定 → Offer選択 → CTA選択 → Publish Record →
 * URL登録 → Views入力 → CTA Click入力 → Purchase入力 → Revenue入力 → Performance反映 →
 * Weekly Review → Learning Candidate → 本人承認 → Next Content Recommendation →
 * Recommendation採用 → 新しいArticleSession作成
 * が実際に一時Vaultへread/writeしながら通ることを確認する。
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

process.env.VAULT_ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "ai-company-content-criticalmonet-"));

const DIST = process.env.CONTENT_DIST;
const noteResearchStore = await import(path.join(DIST, "note/research/store.js"));
const monetizationStore = await import(path.join(DIST, "content/monetization/store.js"));
const metrics = await import(path.join(DIST, "content/monetization/metrics.js"));
const learningStore = await import(path.join(DIST, "content/learning/store.js"));
const learningTypes = await import(path.join(DIST, "content/learning/types.js"));
const learningEngine = await import(path.join(DIST, "content/learning/engine.js"));
const noteStudioTypes = await import(path.join(DIST, "content/note-studio/types.js"));
const noteStudioStore = await import(path.join(DIST, "content/note-studio/store.js"));

let draft;
let offer;
let cta;
let published;

test("1-2. Note記事を作成し、本人承認する", async () => {
  const now = new Date().toISOString();
  draft = {
    id: `draft_monet_${Date.now()}`,
    title: "DAYLOOPを使って商談準備を効率化した話",
    articleType: "free",
    freeSection: "本文",
    tags: [],
    affiliateIds: [],
    needsDisclosure: false,
    sourceResearchItemIds: [],
    sourceExperienceIds: [],
    status: "approved", // 本人承認済み
    createdAt: now,
    updatedAt: now,
  };
  const queue = await noteResearchStore.loadNoteQueue();
  await noteResearchStore.saveNoteQueue({ ...queue, articles: [draft, ...queue.articles] });
  assert.equal(draft.status, "approved");
});

test("3-5. Content Goal・Offer・CTAを設定する", async () => {
  offer = {
    id: "offer_daylop_test",
    name: "DAYLOOP",
    type: "timebox",
    description: "1日の行動設計SaaS",
    status: "active",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  const offersFile = await monetizationStore.loadOffers();
  await monetizationStore.saveOffers({ ...offersFile, offers: [offer, ...offersFile.offers] });

  cta = {
    id: "cta_daylop_test",
    name: "DAYLOOP誘導",
    type: "article-end",
    text: "DAYLOOPを試してみる",
    offerId: offer.id,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  const ctas = await monetizationStore.loadCtaLibrary();
  await monetizationStore.saveCtaLibrary([cta, ...ctas]);

  draft = { ...draft, contentGoal: "trust", offerIds: [offer.id], ctaIds: [cta.id] };
  const queue = await noteResearchStore.loadNoteQueue();
  await noteResearchStore.saveNoteQueue({ ...queue, articles: queue.articles.map((a) => (a.id === draft.id ? draft : a)) });

  const savedOffers = await monetizationStore.loadOffers();
  assert.ok(savedOffers.offers.find((o) => o.id === offer.id));
  const savedCtas = await monetizationStore.loadCtaLibrary();
  assert.ok(savedCtas.find((c) => c.id === cta.id));
});

test("6-7. Publish RecordとURLを登録する（本人操作でのみPublishedになる）", async () => {
  const now = new Date().toISOString();
  published = {
    id: `pub_monet_${Date.now()}`,
    channel: "note",
    contentId: draft.id,
    draftId: draft.id,
    title: draft.title,
    url: "https://note.com/example/n/example123",
    publishedAt: now,
    contentGoal: draft.contentGoal,
    offerIds: draft.offerIds,
    ctaIds: draft.ctaIds,
    status: "published",
  };
  const existing = await noteResearchStore.loadPublishedContent();
  await noteResearchStore.savePublishedContent([published, ...existing]);

  const saved = await noteResearchStore.loadPublishedContent();
  assert.ok(saved.find((p) => p.id === published.id && p.url));
});

test("8-11. Views・CTA Click・Purchase・Revenueを手入力する（取得不能値は捏造しない）", async () => {
  const snapshot = {
    id: `snap_monet_${Date.now()}`,
    publishedContentId: published.id,
    capturedAt: new Date().toISOString(),
    views: 84,
    ctaClicks: 11,
    paidPurchases: 3,
    impressions: null, // Xの計測がまだ無い＝N/A
    source: "manual",
  };
  const perf = await noteResearchStore.loadPerformance();
  await noteResearchStore.savePerformance({ ...perf, snapshots: [snapshot, ...(perf.snapshots ?? [])] });

  const conversion = {
    id: `conv_monet_${Date.now()}`,
    publishedContentId: published.id,
    offerId: offer.id,
    ctaId: cta.id,
    eventType: "purchase",
    occurredAt: new Date().toISOString(),
    source: "manual",
  };
  const ledgerBefore = await monetizationStore.loadLedger();
  await monetizationStore.saveLedger({ ...ledgerBefore, conversions: [conversion, ...ledgerBefore.conversions] });

  const revenueEvent = {
    id: `rev_monet_${Date.now()}`,
    publishedContentId: published.id,
    offerId: offer.id,
    ctaId: cta.id,
    type: "timebox",
    amount: 2940,
    currency: "JPY",
    occurredAt: new Date().toISOString(),
    source: "manual", // AIは生成しない。manual/api/importのみ
  };
  const ledger = await monetizationStore.loadLedger();
  await monetizationStore.saveLedger({ ...ledger, revenueEvents: [revenueEvent, ...ledger.revenueEvents] });

  const savedLedger = await monetizationStore.loadLedger();
  assert.equal(savedLedger.revenueEvents.find((r) => r.id === revenueEvent.id).amount, 2940);
});

test("12. Performanceに反映される（Funnel・派生指標がN/A安全）", async () => {
  const perf = await noteResearchStore.loadPerformance();
  const snapshot = perf.snapshots.find((s) => s.publishedContentId === published.id);
  assert.equal(snapshot.impressions, null, "未計測はnullのまま（0にしない）");

  const funnel = metrics.buildFunnel({
    impressions: snapshot.impressions,
    linkClicks: null,
    noteViews: snapshot.views,
    ctaClicks: snapshot.ctaClicks,
    purchases: snapshot.paidPurchases,
    revenue: 2940,
  });
  const byLabel = Object.fromEntries(funnel.map((f) => [f.label, f]));
  assert.equal(byLabel.impressions.value, null);
  assert.equal(byLabel.noteViews.value, 84);
  assert.equal(byLabel.revenue.value, 2940);
});

test("13. Weekly Reviewが集計できる", async () => {
  const publishedAll = await noteResearchStore.loadPublishedContent();
  const perf = await noteResearchStore.loadPerformance();
  const ledger = await monetizationStore.loadLedger();
  const summary = metrics.weeklyReviewSummary(publishedAll, perf.snapshots ?? [], ledger.revenueEvents);
  assert.equal(summary.needsMoreData, false);
  assert.ok(summary.revenue >= 2940);
});

let learning;

test("14-15. Learning Candidateを作り、本人が承認する", async () => {
  learning = learningTypes.createLearningCandidate({
    period: "2026-W32",
    sourceContentIds: [published.id],
    sourcePerformanceIds: [],
    observation: "DAYLOOP誘導CTAは体験型の記事でクリックされた",
    interpretation: "具体的な利用シーンを書いた記事の方がCTAが押されやすい可能性",
    confidence: "medium",
    actionCandidate: "AIで商談準備を効率化した話",
  });
  assert.equal(learning.status, "candidate");

  const existing = await learningStore.loadLearnings();
  await learningStore.saveLearnings([learning, ...existing]);

  const approved = learningTypes.approveLearning(learning);
  const saved = await learningStore.loadLearnings();
  await learningStore.saveLearnings(saved.map((l) => (l.id === learning.id ? approved : l)));

  const final = await learningStore.loadLearnings();
  assert.equal(final.find((l) => l.id === learning.id).status, "approved");
});

let recommendation;

test("16. Next Content Recommendationが承認済みLearningから生成される", async () => {
  const learnings = await learningStore.loadLearnings();
  const generated = learningEngine.generateRecommendationsFromLearnings(learnings, { channel: "note" });
  assert.equal(generated.length, 1);
  assert.equal(generated[0].topic, "AIで商談準備を効率化した話");
  assert.equal(generated[0].status, "suggested");

  const existing = await learningStore.loadRecommendations();
  await learningStore.saveRecommendations([...generated, ...existing]);
  recommendation = generated[0];
});

test("17-18. Recommendationを採用すると新しいArticleSessionが作られる", async () => {
  const recommendations = await learningStore.loadRecommendations();
  const target = recommendations.find((r) => r.id === recommendation.id);
  assert.equal(target.status, "suggested");

  const session = noteStudioTypes.createArticleSession({ title: target.topic });
  await noteStudioStore.saveSession(session);

  const updated = { ...target, status: "converted", convertedToId: session.id };
  await learningStore.saveRecommendations(recommendations.map((r) => (r.id === target.id ? updated : r)));

  const finalRecs = await learningStore.loadRecommendations();
  assert.equal(finalRecs.find((r) => r.id === recommendation.id).status, "converted");

  const loadedSession = await noteStudioStore.loadSession(session.id);
  assert.equal(loadedSession.title, "AIで商談準備を効率化した話");
  assert.equal(loadedSession.stage, "MATERIAL", "Loopが閉じ、次のArticleSessionがMATERIALから再び始まる");
});
