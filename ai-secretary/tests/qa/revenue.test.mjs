/**
 * Revenue Recording / Attribution（Phase 5 §3〜§9 / Test A B C）
 *
 * ここが緩むと、稼げていないのに FIRST REVENUE が解除される。
 * 「何を収益として数えるか」の境界を重点的に固定する。
 */

import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";

const OUT = path.join(process.env.QA_DIST, "out", "app", "lib", "company");
const store = await import(path.join(OUT, "revenueStore.js"));
const revenue = await import(path.join(OUT, "revenue.js"));
const achievements = await import(path.join(OUT, "achievements.js"));
const mode = await import(path.join(OUT, "revenueMode.js"));

const entry = (over = {}) =>
  store.createRevenueEntry({
    amountYen: 500,
    sourceType: "note",
    occurredAt: "2026-09-13T00:00:00Z",
    confirmedByHuman: true,
    originAgentId: "personal-note",
    ...over,
  });

/* ─── 検証（§9） ────────────────────────────────── */

test("金額0以下は登録できない", () => {
  assert.equal(store.validateRevenueInput({ amountYen: 0, sourceType: "note", confirmedByHuman: true }).ok, false);
  assert.equal(store.validateRevenueInput({ amountYen: -100, sourceType: "note", confirmedByHuman: true }).ok, false);
});

test("不正な収益源は登録できない", () => {
  const result = store.validateRevenueInput({ amountYen: 100, sourceType: "bogus", confirmedByHuman: true });
  assert.equal(result.ok, false);
});

test("【重要】confirmedByHuman の明示を必須にする（§5）", () => {
  const result = store.validateRevenueInput({ amountYen: 100, sourceType: "note" });
  assert.equal(result.ok, false);
  assert.match(result.error, /confirmedByHuman/);
});

test("取消には対象IDが必要", () => {
  const result = store.validateRevenueInput({
    amountYen: 100, sourceType: "note", confirmedByHuman: true, kind: "reversal",
  });
  assert.equal(result.ok, false);
});

/* ─── Append Only（§8） ────────────────────────── */

test("【重要】取消は上書きではなく別エントリで表す", () => {
  const original = entry({ amountYen: 1000 });
  const reversal = store.createRevenueEntry({
    amountYen: 1000, sourceType: "note", occurredAt: "2026-09-14T00:00:00Z",
    confirmedByHuman: true, kind: "reversal", correctsId: original.id,
  });

  const all = [original, reversal];
  // 履歴は2件残る
  assert.equal(all.length, 2);
  // 実効の収益からは外れる
  assert.equal(store.effectiveEntries(all).length, 0);
});

test("修正は修正後の値が使われ、元エントリも残る", () => {
  const original = entry({ amountYen: 1000 });
  const correction = store.createRevenueEntry({
    amountYen: 1500, sourceType: "note", occurredAt: "2026-09-14T00:00:00Z",
    confirmedByHuman: true, kind: "correction", correctsId: original.id,
    originAgentId: "personal-note",
  });

  const effective = store.effectiveEntries([original, correction]);
  assert.equal(effective.length, 1);
  assert.equal(effective[0].amountYen, 1500);
});

/* ─── Test A / B / C ────────────────────────────── */

test("【重要】Test A: ¥1 の確認済み収益で FIRST REVENUE が解除される", () => {
  const effective = store.effectiveEntries([entry({ amountYen: 1 })]);
  const summary = revenue.summarizeRevenue(effective);
  assert.equal(summary.aiGeneratedYen, 1);

  const [first] = achievements.evaluateAchievements({ aiGeneratedRevenueYen: summary.aiGeneratedYen });
  assert.equal(first.unlocked, true);
});

test("【重要】Test B: 未確認の¥10,000では解除されない", () => {
  const effective = store.effectiveEntries([
    entry({ amountYen: 10_000, confirmedByHuman: false }),
  ]);
  const summary = revenue.summarizeRevenue(effective);
  assert.equal(summary.aiGeneratedYen, 0);
  assert.equal(summary.unconfirmedYen, 10_000);

  const [first] = achievements.evaluateAchievements({ aiGeneratedRevenueYen: summary.aiGeneratedYen });
  assert.equal(first.unlocked, false);
});

test("【重要】Test C: 投資利益¥100,000ではAI収益は0のまま", () => {
  const effective = store.effectiveEntries([
    entry({ amountYen: 100_000, sourceType: "investment" }),
  ]);
  const summary = revenue.summarizeRevenue(effective);
  assert.equal(summary.aiGeneratedYen, 0);
  assert.equal(summary.investmentYen, 100_000);

  const [first] = achievements.evaluateAchievements({ aiGeneratedRevenueYen: summary.aiGeneratedYen });
  assert.equal(first.unlocked, false);
});

/* ─── Test E / F モード ────────────────────────── */

test("【重要】Test E: AI収益0では FIRST_REVENUE_MODE", () => {
  assert.equal(mode.resolveRevenueMode(0), "FIRST_REVENUE_MODE");
});

test("【重要】Test F: AI収益¥1で GROWTH_MODE", () => {
  assert.equal(mode.resolveRevenueMode(1), "GROWTH_MODE");
});

test("未計測も FIRST_REVENUE_MODE（測れていないのに成長モードに入らない）", () => {
  assert.equal(mode.resolveRevenueMode(null), "FIRST_REVENUE_MODE");
});

test("最初の1円モードでは既存資産を使うものを優先する（§59）", () => {
  const content = mode.categoryPriority("content", "FIRST_REVENUE_MODE");
  const saas = mode.categoryPriority("saas", "FIRST_REVENUE_MODE");
  assert.ok(content < saas, "ゼロから大規模開発が優先されています");
});

test("成長モードでは拡張性の高いものを優先する", () => {
  const saas = mode.categoryPriority("saas", "GROWTH_MODE");
  const consulting = mode.categoryPriority("consulting", "GROWTH_MODE");
  assert.ok(saas < consulting);
});

/* ─── Attribution Chain（§30） ─────────────────── */

test("【重要】Opportunity → Mission → Trace → Agent を辿れる", () => {
  const record = entry({
    opportunityId: "opp_1",
    missionId: "quest_1",
    originTraceId: "tr_1",
    originAgentId: "personal-note",
    originSkillId: "note-draft-format",
  });
  assert.equal(record.opportunityId, "opp_1");
  assert.equal(record.missionId, "quest_1");
  assert.equal(record.originTraceId, "tr_1");
  assert.equal(record.originAgentId, "personal-note");
});

test("実行に紐づかない収益はAI収益にしない", () => {
  const orphan = store.createRevenueEntry({
    amountYen: 5000, sourceType: "other",
    occurredAt: "2026-09-13T00:00:00Z", confirmedByHuman: true,
  });
  const summary = revenue.summarizeRevenue(store.effectiveEntries([orphan]));
  assert.equal(summary.aiGeneratedYen, 0);
  assert.equal(summary.otherBusinessYen, 5000);
});
