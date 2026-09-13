/**
 * Opportunity Engine / Money Quest（Phase 5 §14〜§25 / Test D G H）
 *
 * 最大の狙いは「稼げる根拠がないのに金額を出す」ことを防ぐこと。
 * 捏造した見込み額でCEOを動かすのが一番害が大きい。
 */

import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";

const OUT = path.join(process.env.QA_DIST, "out", "app", "lib", "company");
const engine = await import(path.join(OUT, "opportunity", "engine.js"));
const score = await import(path.join(OUT, "opportunity", "score.js"));
const quest = await import(path.join(OUT, "opportunity", "moneyQuest.js"));
const types = await import(path.join(OUT, "opportunity", "types.js"));
const store = await import(path.join(OUT, "revenueStore.js"));

const NOW = new Date("2026-09-13T09:00:00Z");

const org = {
  departments: [],
  agents: [
    { id: "personal-note", name: "Note", role: "", departmentId: "personal", departmentName: "P", kind: "employee", riskLevel: "R2", granted: [], canWrite: true, interventionTarget: 15, memoryScopeCount: 3, skillIds: ["note-draft-format"] },
    { id: "personal-fund", name: "Fund", role: "", departmentId: "personal", departmentName: "P", kind: "employee", riskLevel: "R2", granted: [], canWrite: true, interventionTarget: 15, memoryScopeCount: 3, skillIds: [] },
  ],
  totals: { departments: 1, agents: 2, managers: 0, implementedSkills: 1, registeredSkills: 1, workflows: 0 },
  loadedAt: NOW.toISOString(),
};

const revenueEntry = (over = {}) =>
  store.createRevenueEntry({
    amountYen: 500,
    sourceType: "note",
    occurredAt: "2026-09-12T00:00:00Z",
    confirmedByHuman: true,
    originAgentId: "personal-note",
    ...over,
  });

/* ─── 数字を捏造しない（§18） ───────────────────── */

test("【重要】実績が無いカテゴリでは収益見込みを出さない", () => {
  const { opportunities } = engine.generateOpportunities({ organization: org, now: NOW });
  for (const opportunity of opportunities) {
    assert.equal(
      opportunity.expectedRevenue.known,
      false,
      `${opportunity.title} が実績なしで金額を出しています`
    );
    assert.ok(opportunity.expectedRevenue.reason);
  }
});

test("実績があるカテゴリでは見込みを出す", () => {
  const { opportunities } = engine.generateOpportunities({
    organization: org,
    revenueEntries: [revenueEntry({ sourceType: "note", amountYen: 1000 })],
    now: NOW,
  });
  const content = opportunities.find((o) => o.category === "content");
  assert.equal(content.expectedRevenue.known, true);
});

test("【重要】測れなかった項目は0点にせず coverage に出る", () => {
  const result = score.scoreOpportunity({
    expectedRevenue: { known: false, reason: "実績なし" },
    existingAssetMatch: 0.9,
    automationPotential: 0.6,
  });
  assert.ok(result.coveragePct < 100, `coverage=${result.coveragePct}`);
  assert.ok(result.missing.includes("収益見込み"));
  // 測れた項目が高ければスコアは高くなる
  assert.ok(result.score > 50, `score=${result.score}`);
});

test("スコアは0〜100に収まる", () => {
  const result = score.scoreOpportunity({
    expectedRevenue: { known: true, minYen: 999_999, maxYen: 999_999, confidence: 1 },
    estimatedEffortMinutes: 1,
    existingAssetMatch: 1,
    automationPotential: 1,
    initialCostYen: 0,
    scalability: 1,
  });
  assert.ok(result.score >= 0 && result.score <= 100);
});

/* ─── Test D: 重複防止（§20） ──────────────────── */

test("【重要】Test D: 同じ機会を2回生成しても1件のまま", () => {
  const first = engine.generateOpportunities({ organization: org, now: NOW });
  const second = engine.generateOpportunities({
    organization: org,
    existing: first.opportunities,
    now: new Date(NOW.getTime() + 86_400_000),
  });

  assert.equal(second.opportunities.length, first.opportunities.length);

  const fingerprints = second.opportunities.map((o) => o.fingerprint);
  assert.equal(new Set(fingerprints).size, fingerprints.length, "fingerprintが重複しています");

  // IDと作成日は維持され、更新日だけ変わる
  const before = first.opportunities[0];
  const after = second.opportunities.find((o) => o.fingerprint === before.fingerprint);
  assert.equal(after.id, before.id);
  assert.equal(after.createdAt, before.createdAt);
  assert.notEqual(after.updatedAt, before.updatedAt);
});

test("fingerprintはカテゴリ・資産・収益モデルで決まる", () => {
  const a = types.opportunityFingerprint({ category: "content", asset: "x", businessModel: "y" });
  const b = types.opportunityFingerprint({ category: "content", asset: "x", businessModel: "y" });
  const c = types.opportunityFingerprint({ category: "content", asset: "z", businessModel: "y" });
  assert.equal(a, b);
  assert.notEqual(a, c);
});

/* ─── Test G / H: 検証（§53 §57） ───────────────── */

test("【重要】Test G: 収益0のMission完了では VALIDATED にしない", () => {
  const { opportunities } = engine.generateOpportunities({ organization: org, now: NOW });
  const target = opportunities[0];

  // Missionは完了したが収益エントリが無い
  const applied = engine.applyRevenueToOpportunities(opportunities, [], NOW);
  const after = applied.find((o) => o.id === target.id);
  assert.notEqual(after.status, "VALIDATED");
  assert.equal(after.realizedRevenueYen, 0);
});

test("【重要】Test H: 収益¥500が紐づけば VALIDATED になる", () => {
  const { opportunities } = engine.generateOpportunities({ organization: org, now: NOW });
  const target = opportunities[0];

  const applied = engine.applyRevenueToOpportunities(
    opportunities,
    [revenueEntry({ amountYen: 500, opportunityId: target.id, missionId: "quest_1" })],
    NOW
  );
  const after = applied.find((o) => o.id === target.id);
  assert.equal(after.status, "VALIDATED");
  assert.equal(after.realizedRevenueYen, 500);
  assert.ok(after.validatedByMissionIds.includes("quest_1"));
});

test("投資収益では VALIDATED にしない", () => {
  const { opportunities } = engine.generateOpportunities({ organization: org, now: NOW });
  const target = opportunities[0];
  const applied = engine.applyRevenueToOpportunities(
    opportunities,
    [revenueEntry({ sourceType: "investment", opportunityId: target.id })],
    NOW
  );
  assert.notEqual(applied.find((o) => o.id === target.id).status, "VALIDATED");
});

/* ─── Money Quest（§23 §24 §25） ───────────────── */

test("1日のQuestは3件まで（§24）", () => {
  const { opportunities } = engine.generateOpportunities({ organization: org, now: NOW });
  const result = quest.generateMoneyQuests({
    opportunities,
    aiGeneratedRevenueYen: 0,
    now: NOW,
  });
  assert.ok(result.quests.length <= quest.MAX_DAILY_QUESTS);
});

test("【重要】Questは今日できるサイズになっている（§23）", () => {
  const { opportunities } = engine.generateOpportunities({ organization: org, now: NOW });
  const result = quest.generateMoneyQuests({ opportunities, aiGeneratedRevenueYen: 0, now: NOW });

  for (const q of result.quests) {
    // 「月100万円稼ぐ」のような巨大目標ではなく、分単位で終わる一歩であること
    assert.ok(q.estimatedMinutesToRevenue <= 120, `${q.title} が大きすぎます`);
    assert.equal(q.status, "PLANNED");
  }
});

test("Questは機会に紐づく（§28）", () => {
  const { opportunities } = engine.generateOpportunities({ organization: org, now: NOW });
  const result = quest.generateMoneyQuests({ opportunities, aiGeneratedRevenueYen: 0, now: NOW });
  for (const q of result.quests) {
    assert.ok(q.opportunityId, "opportunityId がありません");
  }
});

test("【重要】最初の1円モードでは速さと既存資産を重く見る（§25）", () => {
  const quick = {
    id: "a", category: "content", estimatedEffortMinutes: 30,
    existingAssetMatch: 0.9, automationPotential: 0.5, score: 40,
    expectedRevenue: { known: false, reason: "x" }, status: "CANDIDATE",
  };
  const slow = {
    id: "b", category: "saas", estimatedEffortMinutes: 400,
    existingAssetMatch: 0.2, automationPotential: 0.9, score: 80,
    expectedRevenue: { known: true, minYen: 100_000, maxYen: 200_000, confidence: 0.5 },
    status: "CANDIDATE",
  };

  const firstMode = quest.questPriority(quick, "FIRST_REVENUE_MODE");
  const slowFirst = quest.questPriority(slow, "FIRST_REVENUE_MODE");
  assert.ok(firstMode > slowFirst, "最初の1円モードで大型案件が優先されています");

  // 成長モードでは逆転しうる
  const slowGrowth = quest.questPriority(slow, "GROWTH_MODE");
  const quickGrowth = quest.questPriority(quick, "GROWTH_MODE");
  assert.ok(slowGrowth > quickGrowth);
});

test("却下済み・失敗した機会はQuestにしない", () => {
  const result = quest.generateMoneyQuests({
    opportunities: [
      { id: "a", category: "content", estimatedEffortMinutes: 30, existingAssetMatch: 1, automationPotential: 0.5, score: 50, expectedRevenue: { known: false, reason: "x" }, status: "DISMISSED" },
    ],
    aiGeneratedRevenueYen: 0,
    now: NOW,
  });
  assert.equal(result.quests.length, 0);
});

test("開始・完了で状態が変わる（§52 §53）", () => {
  const mission = { id: "m", status: "PLANNED" };
  assert.equal(quest.startQuest(mission).status, "ACTIVE");
  assert.equal(quest.completeQuest(mission).status, "COMPLETED");
});

/* ─── 学習（§31） ──────────────────────────────── */

test("過去実績をカテゴリ・AI社員・Missionごとに集計できる", () => {
  const learning = engine.summarizePastRevenue([
    revenueEntry({ amountYen: 1000, sourceType: "note", originAgentId: "personal-note", missionId: "m1" }),
    revenueEntry({ amountYen: 500, sourceType: "affiliate", originAgentId: "personal-note", missionId: "m2" }),
  ]);
  assert.equal(learning.pastRevenueByCategory.note, 1000);
  assert.equal(learning.pastRevenueByAgent["personal-note"], 1500);
  assert.equal(learning.pastRevenueByMission.m1, 1000);
});

test("未確認の収益は学習に含めない", () => {
  const learning = engine.summarizePastRevenue([
    revenueEntry({ amountYen: 9999, confirmedByHuman: false }),
  ]);
  assert.equal(learning.pastRevenueByCategory.note, undefined);
});
