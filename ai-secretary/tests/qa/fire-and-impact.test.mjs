/**
 * FIRE設定 / Personal Impact（Phase 5 §32〜§42 / Test I）
 */

import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";

const OUT = path.join(process.env.QA_DIST, "out", "app", "lib", "company");
const settings = await import(path.join(OUT, "financialSettings.js"));
const metrics = await import(path.join(OUT, "personalMetrics.js"));
const impact = await import(path.join(OUT, "personalImpact.js"));
const store = await import(path.join(OUT, "revenueStore.js"));

/* ─── FIRE設定（§36〜§38 / Test I） ────────────── */

test("空の設定はすべて null（0ではない）", () => {
  const empty = settings.emptyFinancialSettings();
  assert.equal(empty.annualLivingCostYen, null);
  assert.equal(empty.targetAssetAmountYen, null);
});

test("どの項目も必須ではない（§36）", () => {
  const normalized = settings.normalizeFinancialSettings({ annualLivingCostYen: 3_000_000 });
  assert.equal(normalized.annualLivingCostYen, 3_000_000);
  assert.equal(normalized.targetAssetAmountYen, null);
});

test("不正な値は null になる", () => {
  const normalized = settings.normalizeFinancialSettings({
    annualLivingCostYen: "abc",
    targetAssetAmountYen: -100,
  });
  assert.equal(normalized.annualLivingCostYen, null);
  assert.equal(normalized.targetAssetAmountYen, null);
});

test("0は有効な値として受け取る（未設定と区別する）", () => {
  assert.equal(settings.normalizeFinancialSettings({ monthlyExpenseYen: 0 }).monthlyExpenseYen, 0);
  assert.equal(settings.normalizeFinancialSettings({ monthlyExpenseYen: "" }).monthlyExpenseYen, null);
});

test("【重要】Test I: FIRE未設定なら NOT_CONFIGURED を維持する", () => {
  const empty = settings.emptyFinancialSettings();
  const result = metrics.computeFireProgress({
    annualLivingCostYen: empty.annualLivingCostYen,
    targetAssetYen: empty.targetAssetAmountYen,
    currentNetWorthYen: null,
    annualPassiveIncomeYen: null,
  });
  assert.equal(result.status, "NOT_CONFIGURED");
  assert.equal(result.progress.value, null);
});

test("目標資産額が明示されていればそれを使う（§38 勝手に倍率を決めない）", () => {
  const result = metrics.computeFireProgress({
    annualLivingCostYen: 3_000_000,
    targetAssetYen: 50_000_000,
    currentNetWorthYen: 10_000_000,
    annualPassiveIncomeYen: null,
  });
  // 4%ルールなら75,000,000になるが、明示値が優先される
  assert.equal(result.targetAssetYen.value, 50_000_000);
});

/* ─── Provider境界（§40 §41） ──────────────────── */

test("手動Providerは未入力を null で返す（0で埋めない）", async () => {
  const provider = settings.manualProvider(settings.emptyFinancialSettings());
  assert.equal(await provider.getMonthlyIncome(), null);
  assert.equal(await provider.getSavingsRate(), null);
});

test("【重要】手動Providerは純資産を返さない（負債が分からないため）", async () => {
  const provider = settings.manualProvider({
    ...settings.emptyFinancialSettings(),
    cashBalanceYen: 1_000_000,
  });
  assert.equal(await provider.getNetWorth(), null);
});

test("収入と支出が揃えば貯蓄率を返す", async () => {
  const provider = settings.manualProvider({
    ...settings.emptyFinancialSettings(),
    monthlyIncomeYen: 500_000,
    monthlyExpenseYen: 300_000,
  });
  assert.equal(await provider.getSavingsRate(), 0.4);
});

test("Providerインターフェースが将来差し替え可能な形になっている", async () => {
  const provider = settings.manualProvider(settings.emptyFinancialSettings());
  for (const method of [
    "getMonthlyIncome", "getMonthlyExpense", "getCashBalance", "getNetWorth", "getSavingsRate",
  ]) {
    assert.equal(typeof provider[method], "function", `${method} がありません`);
  }
  assert.equal(provider.name, "manual");
});

/* ─── Personal Impact（§32〜§35） ──────────────── */

const proposal = (over = {}) => ({
  id: "p1",
  fingerprint: "NEW_AGENT:note:-:x",
  type: "NEW_AGENT",
  title: "テスト提案",
  summary: "",
  evidence: [],
  sourcePatternKeys: [],
  score: 70,
  scoreBreakdown: {},
  confidence: 0.6,
  complexityCost: "medium",
  recommendationRank: 6,
  expectedImpact: { description: "", loadReductionPct: null, timeReductionPct: null },
  risks: ["x"],
  sampleSize: 5,
  observationWindowDays: 14,
  status: "PROPOSED",
  history: [],
  createdAt: "2026-09-13T00:00:00Z",
  updatedAt: "2026-09-13T00:00:00Z",
  ...over,
});

test("【重要】Phase 3 のProposal Schemaを壊さない（personalImpactはOptional）", () => {
  const original = proposal();
  const withImpact = impact.attachPersonalImpact({ proposal: original });

  // 既存フィールドがすべて保たれている
  for (const key of Object.keys(original)) {
    assert.ok(key in withImpact, `${key} が失われています`);
  }
  assert.equal(withImpact.score, original.score);
  assert.equal(withImpact.status, original.status);
});

test("【重要】§35: 実績が無ければ収益影響を出さない（UNKNOWNのまま）", () => {
  const result = impact.attachPersonalImpact({ proposal: proposal() });
  assert.equal(result.personalImpact.expectedRevenueImpactYen, undefined);
  assert.ok(result.personalImpact.unknownReasons.length > 0);
});

test("実績があれば収益影響を見積もる", () => {
  const entries = [
    store.createRevenueEntry({
      amountYen: 1000, sourceType: "note", occurredAt: "2026-09-12T00:00:00Z",
      confirmedByHuman: true, originAgentId: "personal-note",
    }),
  ];
  const result = impact.attachPersonalImpact({
    proposal: proposal({ targetAgent: "personal-note" }),
    revenueEntries: entries,
  });
  assert.equal(result.personalImpact.expectedRevenueImpactYen, 1000);
  assert.ok(result.personalImpact.confidence > 0);
});

test("【重要】投資収益は提案の収益影響に含めない", () => {
  const entries = [
    store.createRevenueEntry({
      amountYen: 100_000, sourceType: "investment", occurredAt: "2026-09-12T00:00:00Z",
      confirmedByHuman: true, originAgentId: "personal-fund",
    }),
  ];
  const result = impact.attachPersonalImpact({
    proposal: proposal({ targetAgent: "personal-fund" }),
    revenueEntries: entries,
  });
  assert.equal(result.personalImpact.expectedRevenueImpactYen, undefined);
});

test("手直しの件数から時間削減を見積もる", () => {
  const result = impact.attachPersonalImpact({
    proposal: proposal({ evidence: [{ label: "本来不要な修正", value: 6, unit: "件" }] }),
  });
  assert.ok(result.personalImpact.expectedTimeSavedMinutes > 0);
});
