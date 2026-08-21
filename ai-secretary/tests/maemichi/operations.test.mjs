import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";

const DIST = process.env.MAEMICHI_DIST;
const operations = await import(path.join(DIST, "note/operations.js"));
const types = await import(path.join(DIST, "note/research/types.js"));

const brand = {
  personality: { avoidedExpressions: ["絶対稼げる"] },
};
const draft = {
  id: "d1", xAccountId: "x1", purpose: "reach", genreId: "ai", text: "AI活用では、小さく試して結果を見る方法が現実的です。",
  urls: [], needsDisclosure: false, status: "draft", createdAt: "", updatedAt: "",
};

test("初期Xスケジュールは07:30/12:15/20:30と目的を保持する", () => {
  assert.deepEqual(operations.DEFAULT_X_SCHEDULE.map((slot) => slot.time), ["07:30", "12:15", "20:30"]);
  assert.deepEqual(operations.DEFAULT_X_SCHEDULE.map((slot) => slot.purpose), ["reach", "trust", "note-bridge"]);
  assert.equal(operations.scheduledAtInTokyo(new Date("2026-08-21T00:00:00Z"), "07:30"), "2026-08-20T22:30:00.000Z");
});

test("Safety Gateは通常投稿を通し成果保証・個人情報・根拠なし体験を止める", () => {
  assert.equal(operations.runXSafetyGate({ draft, brand, experiences: [] }).safe, true);
  const unsafe = operations.runXSafetyGate({
    draft: { ...draft, text: "私が試したので絶対に稼げます。090-1234-5678" }, brand, experiences: [],
  });
  assert.equal(unsafe.safe, false);
  assert.ok(unsafe.reasons.length >= 3);
});

test("Performance Scoreは反応が強い投稿ほど高く、0〜100に収まる", () => {
  const weights = types.defaultPerformanceWeights();
  const low = operations.contentPerformanceScore({ contentId: "a", platform: "x", purpose: "reach", genreId: "ai", publishedAt: "", measuredAt: "", impressions: 100 }, weights);
  const high = operations.contentPerformanceScore({ contentId: "b", platform: "x", purpose: "reach", genreId: "ai", publishedAt: "", measuredAt: "", impressions: 10000, likes: 500, replies: 30, reposts: 80, profileVisits: 300, followersGained: 50, noteClicks: 100 }, weights);
  assert.ok(high > low);
  assert.ok(high <= 100 && low >= 0);
});

test("Winning Topicは同一clusterの複数投稿で判定し次の昇格段階を返す", () => {
  const records = [1, 2, 3].map((n) => ({ contentId: `p${n}`, trendClusterId: "topic-ai", platform: "x", purpose: "reach", genreId: "ai", publishedAt: "2026-08-20", measuredAt: "", impressions: 10000, likes: 500, replies: 30, reposts: 80, noteClicks: 100 }));
  const [topic] = operations.evaluateWinningTopics(records, types.defaultPerformanceWeights(), types.defaultWinningTopicPolicy());
  assert.equal(topic.topicId, "topic-ai");
  assert.equal(topic.winning, true);
  assert.equal(topic.nextStage, "paid-note");
});

test("90日ファネルを集計しボトルネックを決定論的に診断する", () => {
  const funnel = operations.buildFunnel([{ contentId: "x", platform: "x", purpose: "note-bridge", genreId: "ai", publishedAt: "", measuredAt: "", impressions: 10000, profileVisits: 200, followersGained: 20, noteClicks: 1 }]);
  assert.equal(funnel.impressions, 10000);
  assert.match(operations.diagnoseFunnel(funnel), /CTA/);
});

test("note価格帯は無料・100円・300〜500円・1000円以上を提案する", () => {
  assert.equal(operations.suggestedPriceBand("free", false, 0), "無料");
  assert.match(operations.suggestedPriceBand("paid", false, 1), /100円/);
  assert.match(operations.suggestedPriceBand("paid", true, 2), /300〜500円/);
  assert.match(operations.suggestedPriceBand("paid", true, 3), /1,000円以上/);
});

test("note実公開は無料・有料を問わずHuman Approvalを必須にする", () => {
  assert.equal(operations.canQueueNotePublication({ status: "draft", articleType: "free" }).allowed, false);
  assert.equal(operations.canQueueNotePublication({ status: "approved", articleType: "free" }).allowed, true);
  assert.equal(operations.canQueueNotePublication({ status: "approved", articleType: "paid", price: 100 }).allowed, false);
  assert.equal(operations.canQueueNotePublication({ status: "approved", articleType: "paid", price: 100, paywallAfterHeading: "実践" }).allowed, true);
});

test("Metrics欠損だけではWinning Topicへ誤判定しない", () => {
  const records = [1, 2, 3].map((n) => ({ contentId: `m${n}`, trendClusterId: "missing", platform: "x", purpose: "reach", genreId: "ai", publishedAt: "", measuredAt: "", metricAvailability: { impressions: "unavailable" } }));
  const [topic] = operations.evaluateWinningTopics(records, types.defaultPerformanceWeights(), types.defaultWinningTopicPolicy());
  assert.equal(topic.averageScore, 0);
  assert.equal(topic.winning, false);
});

test("週次候補はfree 2本 / paid 1本を上限に作る", () => {
  const topics = [
    { topicId: "a", genreId: "ai", postCount: 3, averageScore: 90, strongPostCount: 3, winning: true, nextStage: "paid-note" },
    { topicId: "b", genreId: "ai", postCount: 3, averageScore: 70, strongPostCount: 3, winning: true, nextStage: "free-note" },
    { topicId: "c", genreId: "ai", postCount: 3, averageScore: 60, strongPostCount: 3, winning: true, nextStage: "free-note" },
  ];
  const plan = operations.planWeeklyNoteCandidates({ topics, existingArticles: [], weekKey: "2026-08-17" });
  assert.equal(plan.filter((item) => item.articleType === "free").length, 2);
  assert.equal(plan.filter((item) => item.articleType === "paid").length, 1);
});

test("同一Topicの重複昇格とScheduler再実行を防ぐ", () => {
  const topic = { topicId: "a", genreId: "ai", postCount: 3, averageScore: 90, strongPostCount: 3, winning: true, nextStage: "paid-note" };
  const existing = [
    { autoCandidateKey: "2026-08-17:a:free", autoCandidateWeek: "2026-08-17", articleType: "free", status: "draft" },
    { autoCandidateKey: "2026-08-17:a:paid", autoCandidateWeek: "2026-08-17", articleType: "paid", status: "draft" },
  ];
  assert.deepEqual(operations.planWeeklyNoteCandidates({ topics: [topic], existingArticles: existing, weekKey: "2026-08-17" }), []);
});

test("Metrics Syncは1h/6h/24hだけ取得して24h後に停止する", () => {
  assert.equal(operations.nextMetricsSnapshotHour(0.9), null);
  assert.equal(operations.nextMetricsSnapshotHour(1.1), 1);
  assert.equal(operations.nextMetricsSnapshotHour(6.2, 1), 6);
  assert.equal(operations.nextMetricsSnapshotHour(25, 6), 24);
  assert.equal(operations.nextMetricsSnapshotHour(100, 24), null);
});
