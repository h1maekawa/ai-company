import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import fs from "node:fs";

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

test("X weighted lengthは日本語・英数字・URLをX/Buffer境界に合わせて数える", () => {
  assert.equal(operations.xWeightedLength("a".repeat(280)), 280);
  assert.equal(operations.xWeightedLength("あ".repeat(140)), 280);
  assert.equal(operations.xWeightedLength(`確認 https://example.com/${"x".repeat(200)}`), 28);
  assert.equal(operations.runXSafetyGate({ draft: { ...draft, text: "a".repeat(280) }, brand, experiences: [] }).safe, true);
  const tooLong = operations.runXSafetyGate({ draft: { ...draft, text: "a".repeat(281) }, brand, experiences: [] });
  assert.equal(tooLong.safe, false);
  assert.ok(tooLong.reasons.includes("Xの文字数上限を超えています。投稿を短くしてください。"));
});

test("日本語120文字程度は生成TARGETと280上限以内", () => {
  const length = operations.xWeightedLength("あ".repeat(120));
  assert.equal(length, 240);
  assert.ok(length <= operations.TARGET_X_WEIGHTED_LENGTH);
  assert.ok(length <= operations.X_MAX_WEIGHTED_LENGTH);
});

test("生成結果が280以内ならretryせず採用する", async () => {
  let calls = 0;
  const result = await operations.validateGeneratedXText("あ".repeat(130), async () => {
    calls += 1;
    return "呼ばれない";
  });
  assert.equal(result.withinLimit, true);
  assert.equal(calls, 0);
});

test("280超はAI短縮をretryし、収まれば採用する", async () => {
  const inputs = [];
  const original = "長".repeat(141);
  const result = await operations.validateGeneratedXText(original, async (text) => {
    inputs.push(text);
    return "短".repeat(125);
  });
  assert.equal(result.withinLimit, true);
  assert.equal(result.retryCount, 1);
  assert.deepEqual(inputs, [original]);
  assert.equal(result.text, "短".repeat(125));
});

test("retry後も280超なら2回で停止しBuffer対象外の結果にする", async () => {
  let calls = 0;
  const original = "長".repeat(141);
  const result = await operations.validateGeneratedXText(original, async (text) => {
    calls += 1;
    assert.equal(text, original);
    return text;
  });
  assert.equal(result.withinLimit, false);
  assert.equal(result.retryCount, 2);
  assert.equal(calls, 2);
  assert.equal(result.text, original, "機械的にtruncateしてはいけない");
});

test("長すぎる既存Draftは検査しても書き換えない", async () => {
  const existing = { ...draft, text: "既".repeat(141), failureReason: undefined };
  const snapshot = structuredClone(existing);
  await operations.validateGeneratedXText(existing.text, async (text) => text);
  assert.deepEqual(existing, snapshot);
});

test("reach/trust/note-bridgeの生成長検査はすべて同じ280上限を使う", async () => {
  for (const purpose of ["reach", "trust", "note-bridge"]) {
    const result = await operations.validateGeneratedXText(`${purpose}:` + "あ".repeat(120), async () => "");
    assert.equal(result.withinLimit, true, purpose);
  }
});

test("生成Prompt・UI・importがweighted length SSOTを使用する", () => {
  // テスト実行cwdはリポジトリルート。DIST外の実ソースを回帰契約として確認する。
  const generateSource = fs.readFileSync(path.join(process.cwd(), "app/lib/note/research/generate.ts"), "utf8");
  const queueSource = fs.readFileSync(path.join(process.cwd(), "components/note/PublishQueue.tsx"), "utf8");
  const importSource = fs.readFileSync(path.join(process.cwd(), "app/api/note/content/import/route.ts"), "utf8");
  assert.match(generateSource, /validateGeneratedXText/);
  assert.match(generateSource, /120〜130文字程度/);
  assert.match(generateSource, /1投稿につき1メッセージ/);
  assert.match(generateSource, /文章を途中で切らない/);
  assert.match(queueSource, /xWeightedLength\(d\.text\)/);
  assert.match(queueSource, /文字数超過/);
  assert.match(queueSource, /\|\| isOverLength/);
  assert.match(importSource, /xWeightedLength\(text\)/);
  assert.doesNotMatch(generateSource, /\.slice\([^\n]*X_MAX_WEIGHTED_LENGTH/);
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
