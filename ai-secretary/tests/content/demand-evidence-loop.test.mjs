import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

process.env.VAULT_ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "demand-evidence-"));

const OUT = path.join(process.env.CONTENT_DIST, "content");
const engine = await import(path.join(OUT, "evidence", "engine.js"));
const evidenceStore = await import(path.join(OUT, "evidence", "store.js"));
const learning = await import(path.join(OUT, "learning", "engine.js"));
const metrics = await import(path.join(OUT, "monetization", "metrics.js"));

const published = (over = {}) => ({
  id: "pub-x",
  channel: "x",
  contentId: "x-draft-1",
  sourceKnowledgeId: "knowledge-1",
  opportunityId: "opportunity-1",
  title: "Human Only Boundary",
  publishedAt: "2026-09-19T00:00:00Z",
  offerIds: [],
  ctaIds: [],
  status: "published",
  ...over,
});

const snapshot = (over = {}) => ({
  id: "snap-x",
  publishedContentId: "pub-x",
  capturedAt: "2026-09-19T01:00:00Z",
  impressions: 20_000,
  likes: 300,
  comments: 10,
  replies: 5,
  reposts: 20,
  bookmarks: 150,
  profileVisits: 400,
  linkClicks: 200,
  source: "manual",
  ...over,
});

test("A-C: SnapshotからDemandを生成し、missing/0除算を安全に扱う", () => {
  const evidence = engine.createDemandEvidence({
    published: published(),
    snapshot: snapshot({ impressions: 0, comments: null, replies: undefined }),
  });
  assert.equal(evidence.sourceKnowledgeId, "knowledge-1");
  assert.equal(evidence.engagements, 470);
  assert.equal(evidence.engagementCoveragePct, 60);
  assert.equal(evidence.engagementRate, undefined);
  assert.equal(evidence.clickThroughRate, undefined);
  assert.equal(evidence.coveragePct, 67);
});

test("D/J: Revenue 0でも失敗扱いせず、比較不足なら高需要と断定しない", () => {
  const evidence = engine.createDemandEvidence({
    published: published(),
    snapshot: snapshot({ revenue: 0 }),
    baselineSnapshots: [snapshot({ id: "b1", publishedContentId: "b1", impressions: 100 })],
  });
  assert.equal(evidence.status, "INSUFFICIENT_DATA");
  assert.equal(evidence.relativeScore, undefined);
});

test("本人の過去X投稿5件との相対比較でObserved Demandになる", () => {
  const baselines = [1, 2, 3, 4, 5].map((value) =>
    snapshot({
      id: `baseline-${value}`,
      publishedContentId: `pub-${value}`,
      impressions: value * 1_000,
      linkClicks: value * 5,
      profileVisits: value * 20,
    })
  );
  const evidence = engine.createDemandEvidence({
    published: published(),
    snapshot: snapshot(),
    baselineSnapshots: baselines,
  });
  assert.equal(evidence.status, "OBSERVED");
  assert.equal(evidence.relativeScore, 100);
  assert.equal(evidence.baselineSampleSize, 5);
});

test("E/F/G: Knowledge参照付きX→Note RelationとAssisted Contributionを保存・取得", async () => {
  const relation = {
    id: "relation-1",
    sourcePublishedContentId: "pub-x",
    targetPublishedContentId: "pub-note",
    relationType: "drives_to",
    evidenceType: "explicit_link",
    createdAt: "2026-09-19T02:00:00Z",
  };
  const contribution = {
    id: "contribution-1",
    companyRevenueId: "company-revenue-1",
    sourcePublishedContentId: "pub-x",
    targetPublishedContentId: "pub-note",
    contributionType: "assisted",
    evidenceType: "explicit_link",
    confirmedByHuman: false,
    createdAt: "2026-09-19T03:00:00Z",
  };
  await evidenceStore.appendContentRelation(relation);
  await evidenceStore.appendContentContribution(contribution);
  const loaded = await evidenceStore.loadContentEvidence();
  assert.deepEqual(loaded.relations, [relation]);
  assert.deepEqual(loaded.contributions, [contribution]);
});

test("H: Assisted ContributionはRevenue Eventを複製せず参照だけを持つ", () => {
  const events = [{ id: "content-revenue-1", publishedContentId: "pub-note", amount: 1_000 }];
  const contributions = [
    { companyRevenueId: "company-revenue-1" },
    { companyRevenueId: "company-revenue-1" },
  ];
  assert.equal(metrics.totalRevenue(events), 1_000);
  assert.deepEqual(engine.referencedRevenueIds(contributions), ["company-revenue-1"]);
});

test("K/L: Demand解釈はcandidate、approved Learningだけがx-then-noteになる", () => {
  const evidence = engine.createDemandEvidence({ published: published(), snapshot: snapshot() });
  const candidate = learning.createDemandLearningCandidate(
    evidence,
    "AI安全設計への需要が高い可能性がある",
    "Human Only BoundaryのNoteを作る"
  );
  assert.equal(candidate.status, "candidate");
  assert.equal(
    learning.generateRecommendationsFromLearnings([candidate], { channel: "x-then-note" }).length,
    0
  );
  const approved = { ...candidate, status: "approved" };
  const recommendations = learning.generateRecommendationsFromLearnings([approved], {
    channel: "x-then-note",
  });
  assert.equal(recommendations.length, 1);
  assert.equal(recommendations[0].channel, "x-then-note");
});
