import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";

const root = process.env.MAEMICHI_DIST;
const learning = await import(path.join(root, "note/automation/xStrategyLearning.js"));
const demand = await import(path.join(root, "note/automation/marketDemand.js"));
const types = await import(path.join(root, "note/research/types.js"));

const now = new Date("2026-10-11T00:00:00.000Z");
const record = (id, genreId, impressions, days = 1) => ({
  contentId: id, platform: "x", purpose: "reach", genreId,
  publishedAt: new Date(now.getTime() - days * 86_400_000).toISOString(),
  measuredAt: now.toISOString(), impressions,
});
const review = (strategy) => ({ strategyAfter: strategy, winningTopics: [], winningPatterns: [] });

test("AI2/Investment1への変更は両domain 3件以上・7d/30d evidenceがある時だけ1枠動かす", () => {
  const strategy = types.defaultContentGrowthStrategy();
  const records = [
    ...[1, 2, 3].map((n) => record(`a${n}`, "ai", 300, n)),
    ...[1, 2, 3].map((n) => record(`i${n}`, "investment", 100, n)),
    ...[1, 2, 3].map((n) => record(`a-old${n}`, "ai", 30, 15 + n)),
    ...[1, 2, 3].map((n) => record(`i-old${n}`, "investment", 100, 15 + n)),
  ];
  const result = learning.applyBoundedXStrategyLearning({ strategy, review: review(strategy), records, now });
  assert.deepEqual(result.strategy.xDomainMix, { ai: 2, investment: 1 });
  assert.equal(result.changes[0].sampleSize, 6);
  assert.ok(result.changes[0].evidenceRefs.length === 6);
});

test("欠損metricsや3件未満は0扱いせずINSUFFICIENT_SAMPLE", () => {
  const strategy = types.defaultContentGrowthStrategy();
  const records = [record("a1", "ai", 300), record("i1", "investment", undefined)];
  const result = learning.applyBoundedXStrategyLearning({ strategy, review: review(strategy), records, now });
  assert.equal(result.changes.length, 0);
  assert.ok(result.skipped.includes("INSUFFICIENT_SAMPLE:xDomainMix"));
});

test("Market Demandは利用可能signalだけ再加重しGoogle Trends未設定を明示する", () => {
  const cluster = { id: "c", researchItemIds: ["r1", "r2"], title: "AI", summary: "", genreIds: ["ai"] };
  const items = [
    { id: "r1", sourceUrl: "https://a.example/x", platform: "web", fetchedAt: now.toISOString(), publishedAt: now.toISOString(), publicMetrics: { likes: 10 } },
    { id: "r2", sourceUrl: "https://b.example/y", platform: "web", fetchedAt: now.toISOString(), publishedAt: now.toISOString() },
  ];
  const result = demand.computeMarketDemand(cluster, items, [], now);
  assert.equal(result.signals.googleTrends.availability, "UNAVAILABLE");
  assert.equal(result.signals.sourceDiversity.value, 2);
  assert.ok(result.score !== null && result.coverage > 0);
});
