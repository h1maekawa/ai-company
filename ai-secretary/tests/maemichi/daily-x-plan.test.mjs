import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";

const DIST = process.env.MAEMICHI_DIST;
const plan = await import(path.join(DIST, "note/automation/dailyXPlan.js"));
const growth = await import(path.join(DIST, "note/growthLoop.js"));
const tokyo = await import(path.join(DIST, "note/tokyoDate.js"));
const types = await import(path.join(DIST, "note/research/types.js"));
const metrics = await import(path.join(DIST, "note/publishing/bufferMetrics.js"));

const strategy = (overrides = {}) => ({ ...types.defaultContentGrowthStrategy(), ...overrides });
const cluster = (id, hotScore, genreIds = ["ai"]) => ({ id, title: id, summary: "", genreIds, researchItemIds: [], matchedExperienceIds: [], totalScore: hotScore, hotScore, status: "candidate" });
const input = (overrides = {}) => ({
  date: "2026-09-24", accountKey: "primary", now: new Date("2026-09-23T22:10:00Z"),
  strategy: strategy(), maxXPostsPerDay: 3, candidates: [cluster("c1", 90), cluster("c2", 80), cluster("c3", 70)], ...overrides,
});

test("T3 deterministic plan: 同一入力で完全一致（id / purpose / exploration / candidateRef）", () => {
  const a = plan.buildDailyXPlan(input());
  const b = plan.buildDailyXPlan(input());
  assert.deepEqual(a, b);
  assert.equal(a.id, "daily-x:2026-09-24:primary");
  assert.deepEqual(a.slots.map((slot) => slot.id), ["daily-x:2026-09-24:primary:0", "daily-x:2026-09-24:primary:1", "daily-x:2026-09-24:primary:2"]);
  assert.deepEqual(a.slots.map((slot) => slot.scheduledTime), ["07:30", "12:15", "20:30"]);
  assert.equal(a.slots[0].scheduledAt, "2026-09-23T22:30:00.000Z");
  assert.ok(a.slots.every((slot) => slot.status === "planned" && slot.timeSource === "default"));
  assert.equal(plan.buildDailyXPlan(input({ candidates: [] })), null, "候補0件ならnull");
});

test("slot数は min(maxXPostsPerDay, 既定スケジュール数)", () => {
  assert.equal(plan.buildDailyXPlan(input({ maxXPostsPerDay: 1 })).slots.length, 1);
  assert.equal(plan.buildDailyXPlan(input({ maxXPostsPerDay: 9 })).slots.length, 3);
});

test("T5 trust bucket: trust は reach、monetize系3種は monetize、未知は null", () => {
  assert.equal(growth.purposeBucket("trust"), "reach");
  assert.equal(growth.purposeBucket("reach"), "reach");
  assert.equal(growth.purposeBucket("note-bridge"), "noteBridge");
  for (const purpose of ["affiliate", "paid-note", "x-monetization"]) assert.equal(growth.purposeBucket(purpose), "monetize");
  assert.equal(growth.purposeBucket("unknown-purpose"), null);
});

test("T5b 学習: trust投稿の実績は monetize ではなく reach に数える", () => {
  const record = (purpose, impressions) => ({ contentId: purpose + impressions, platform: "x", purpose, impressions, likes: 0, replies: 0, reposts: 0, linkClicks: 0, metricAvailability: {} });
  const weights = types.defaultPerformanceWeights ? types.defaultPerformanceWeights() : { impressions: 1 };
  const before = strategy();
  const records = [record("trust", 100000), record("trust", 100000), record("reach", 100000), record("reach", 100000), record("note-bridge", 1), record("note-bridge", 1)];
  const { strategy: after } = growth.improveStrategy(before, records, weights, "medium", [], [], new Date("2026-09-24T00:00:00Z"));
  assert.ok(after.purposeMix.monetize <= before.purposeMix.monetize, "trustの好成績でmonetizeを増やさない");
});

test("T6 weekly allocation: 70/20/10・3slot → reach 15 / noteBridge 4 / monetize 2、同一日にmonetize 2件なし", () => {
  const weekly = plan.allocateWeeklyPurposes({ purposeMix: { reach: 70, noteBridge: 20, monetize: 10 }, slotsPerDay: 3 });
  assert.equal(weekly.length, 21);
  const count = (bucket) => weekly.filter((item) => item === bucket).length;
  assert.deepEqual([count("reach"), count("noteBridge"), count("monetize")], [15, 4, 2]);
  for (let day = 0; day < 7; day++) assert.ok(weekly.slice(day * 3, day * 3 + 3).filter((item) => item === "monetize").length <= 1, `day ${day}`);
  assert.deepEqual(plan.allocateWeeklyPurposes({ purposeMix: { reach: 70, noteBridge: 20, monetize: 10 }, slotsPerDay: 3 }), weekly, "決定的");
  const purposes = plan.purposesForDay(["monetize", "reach", "reach"]);
  assert.deepEqual(purposes, ["x-monetization", "reach", "trust"]);
  assert.deepEqual(plan.purposesForDay(["reach", "reach", "reach"]), ["reach", "trust", "reach"]);
  // 1週間分のPlanでmonetize bucketのpurposeは x-monetization だけ
  for (let day = 21; day <= 27; day++) {
    const built = plan.buildDailyXPlan(input({ date: `2026-09-${day}` }));
    for (const slot of built.slots.filter((item) => item.bucket === "monetize")) assert.equal(slot.purpose, "x-monetization");
    assert.ok(built.slots.every((slot) => !["affiliate", "paid-note"].includes(slot.purpose)));
  }
});

test("T7 allocation bounds: PURPOSE_BOUNDS外のmixもclamp・正規化される", () => {
  const normalized = plan.normalizePurposeMix({ reach: 100, noteBridge: 0, monetize: 90 });
  assert.ok(Math.abs(normalized.reach + normalized.noteBridge + normalized.monetize - 100) < 1e-9);
  const weekly = plan.allocateWeeklyPurposes({ purposeMix: { reach: 100, noteBridge: 0, monetize: 90 }, slotsPerDay: 3 });
  assert.equal(weekly.length, 21);
  assert.ok(weekly.includes("noteBridge"), "下限10%のnoteBridgeが入る");
  assert.ok(weekly.filter((item) => item === "monetize").length <= 21 * 0.2 + 1, "上限20%付近に収まる");
  assert.deepEqual(growth.PURPOSE_BOUNDS, { reach: [50, 80], noteBridge: [10, 35], monetize: [5, 20] });
});

test("T8 exploration: 0で全false・100で全true（単体）、Planは15〜30へclamp、同一slotIdで不変", () => {
  const ids = Array.from({ length: 50 }, (_, i) => `daily-x:2026-09-${i}:primary:0`);
  assert.ok(ids.every((id) => plan.isExplorationSlot(id, 0) === false));
  assert.ok(ids.every((id) => plan.isExplorationSlot(id, 100) === true));
  assert.equal(plan.stableBucket("x"), plan.stableBucket("x"));
  assert.equal(plan.buildDailyXPlan(input({ strategy: strategy({ explorationRate: 5 }) })).strategySnapshot.explorationRate, 15);
  assert.equal(plan.buildDailyXPlan(input({ strategy: strategy({ explorationRate: 50 }) })).strategySnapshot.explorationRate, 30);
  const built = plan.buildDailyXPlan(input());
  for (const slot of built.slots) assert.equal(slot.exploration, plan.isExplorationSlot(slot.id, built.strategySnapshot.explorationRate));
});

test("T9 Tokyo date: 2026-09-23T22:10Z と 2026-09-24T01:00Z は同じ日次キー 2026-09-24", () => {
  assert.equal(tokyo.tokyoDateKey(new Date("2026-09-23T22:10:00Z")), "2026-09-24");
  assert.equal(tokyo.tokyoDateKey(new Date("2026-09-24T01:00:00Z")), "2026-09-24");
  assert.equal(tokyo.tokyoDateKey(new Date("2026-09-23T14:59:59Z")), "2026-09-23");
  assert.equal(tokyo.tokyoDayStartMs("2026-09-24"), Date.parse("2026-09-23T15:00:00Z"));
  assert.equal(plan.tokyoDayIndexInWeek("2026-09-21"), 0, "月曜起点");
  assert.equal(plan.tokyoDayIndexInWeek("2026-09-27"), 6);
});

test("T20 slot candidate: 候補3件なら3slotに別cluster、1件なら全slotが同じclusterを再利用", () => {
  const three = plan.buildDailyXPlan(input());
  assert.equal(new Set(three.slots.map((slot) => slot.candidateRef.id)).size, 3);
  const one = plan.buildDailyXPlan(input({ candidates: [cluster("only", 50)] }));
  assert.deepEqual(one.slots.map((slot) => slot.candidateRef), [{ kind: "cluster", id: "only" }, { kind: "cluster", id: "only" }, { kind: "cluster", id: "only" }]);
});

test("exploitation順は topicPriority / genrePriority、exploration順は hotScore", () => {
  const candidates = [cluster("hot", 99, ["other"]), cluster("priority", 10, ["ai"])];
  assert.equal(plan.exploitationOrder(candidates, { topicPriority: ["priority"], genrePriority: [] })[0].id, "priority");
  assert.equal(plan.explorationOrder(candidates)[0].id, "hot");
});

test("T18 purposeMix SSOT: 更新値が growthStrategy.purposeMix と purposeMix の両方に同値で入る", () => {
  const current = { purposeMix: { reach: 70, noteBridge: 20, monetize: 10 }, growthStrategy: strategy({ purposeMix: { reach: 60, noteBridge: 25, monetize: 15 } }) };
  const updated = types.withPurposeMixUpdate(current, { monetize: 5, reach: 70 });
  assert.deepEqual(updated.growthStrategy.purposeMix, { reach: 70, noteBridge: 25, monetize: 5 });
  assert.deepEqual(updated.purposeMix, updated.growthStrategy.purposeMix);
  assert.notEqual(updated.purposeMix, updated.growthStrategy.purposeMix, "別オブジェクトのミラー");
  const unchanged = types.withPurposeMixUpdate(current, undefined);
  assert.deepEqual(unchanged.purposeMix, current.growthStrategy.purposeMix, "旧purposeMixではなく正（growthStrategy）に揃える");
});

test("T19 metrics window: 8日前・当日は対象外、2日前は対象。snapshotHoursを設定", () => {
  const now = new Date("2026-09-24T03:00:00Z");
  const draft = (scheduledAt) => ({ id: "d", scheduledAt, bufferPostId: "b", text: "t", urls: [], purpose: "reach" });
  assert.equal(metrics.isDailyMetricsCandidate(draft("2026-09-16T00:00:00Z"), now), false, "8日前");
  assert.equal(metrics.isDailyMetricsCandidate(draft("2026-09-24T00:00:00Z"), now), false, "当日（JST）");
  assert.equal(metrics.isDailyMetricsCandidate(draft("2026-09-22T00:00:00Z"), now), true, "2日前");
  const record = metrics.normalizeBufferMetrics(draft("2026-09-22T00:00:00Z"), { id: "b", sentAt: "2026-09-22T00:00:00Z", metrics: [{ type: "impressions", value: 10 }], metricsUpdatedAt: "2026-09-24T00:00:00Z" }, now);
  assert.equal(record.snapshotHours, 51);
});
