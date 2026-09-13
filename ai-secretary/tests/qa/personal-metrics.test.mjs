/**
 * Personal KPI / Health / Revenue / Achievement（Phase 4 §10〜§19 / §28）
 *
 * 最重要は「0」と「未設定」を混同しないこと。
 * ここが崩れると、測っていないだけのものが「実績ゼロ」として表示され、
 * CEOの判断を誤らせる。
 */

import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";

const OUT = path.join(process.env.QA_DIST, "out", "app", "lib", "company");
const m = await import(path.join(OUT, "personalMetrics.js"));
const health = await import(path.join(OUT, "health.js"));
const revenue = await import(path.join(OUT, "revenue.js"));
const achievements = await import(path.join(OUT, "achievements.js"));
const missions = await import(path.join(OUT, "missions.js"));

/* ─── Metric の可用性（§11） ───────────────────── */

test("【重要】未設定と0を区別する", () => {
  const zero = m.available(0);
  const unset = m.unavailable("NOT_CONNECTED", "未接続");

  assert.equal(m.isAvailable(zero), true);
  assert.equal(zero.value, 0);

  assert.equal(m.isAvailable(unset), false);
  assert.equal(unset.value, null);
});

test("空のKPIはすべて未接続で始まる（0で埋めない）", () => {
  const metrics = m.emptyPersonalMetrics();
  assert.equal(metrics.financial.netWorthYen.value, null);
  assert.equal(metrics.financial.netWorthYen.availability, "NOT_CONNECTED");
  assert.equal(metrics.freedom.fireProgress.availability, "NOT_CONFIGURED");
});

/* ─── FIRE Progress（§12 / Test E） ────────────── */

test("【重要】Test E: 純資産が未設定なら NOT_CONFIGURED（0%ではない）", () => {
  const result = m.computeFireProgress({
    annualLivingCostYen: 3_000_000,
    targetAssetYen: null,
    currentNetWorthYen: null,
    annualPassiveIncomeYen: null,
  });
  assert.equal(result.status, "NOT_CONFIGURED");
  assert.equal(result.progress.value, null);
  assert.notEqual(result.progress.value, 0);
});

test("生活費も目標額も無ければ NOT_CONFIGURED（推測しない）", () => {
  const result = m.computeFireProgress({
    annualLivingCostYen: null,
    targetAssetYen: null,
    currentNetWorthYen: 5_000_000,
    annualPassiveIncomeYen: null,
  });
  assert.equal(result.status, "NOT_CONFIGURED");
  assert.ok(result.missing.length > 0);
});

test("生活費から4%ルールで目標額を算出する", () => {
  const result = m.computeFireProgress({
    annualLivingCostYen: 3_000_000,
    targetAssetYen: null,
    currentNetWorthYen: 7_500_000,
    annualPassiveIncomeYen: null,
  });
  assert.equal(result.targetAssetYen.value, 75_000_000);
  assert.equal(result.progress.value, 0.1);
  assert.equal(result.status, "IN_PROGRESS");
});

test("目標額に達したら ACHIEVED", () => {
  const result = m.computeFireProgress({
    annualLivingCostYen: null,
    targetAssetYen: 10_000_000,
    currentNetWorthYen: 12_000_000,
    annualPassiveIncomeYen: null,
  });
  assert.equal(result.status, "ACHIEVED");
  assert.equal(result.progress.value, 1);
});

/* ─── 貯蓄率 ─────────────────────────────────────── */

test("収入か支出が欠けたら貯蓄率を計算しない", () => {
  assert.equal(m.computeSavingsRate(null, 200_000).value, null);
  assert.equal(m.computeSavingsRate(300_000, null).value, null);
});

test("収入0では貯蓄率を計算しない（0除算を避ける）", () => {
  assert.equal(m.computeSavingsRate(0, 100_000).availability, "NO_DATA");
});

test("貯蓄率を計算する", () => {
  assert.equal(m.computeSavingsRate(500_000, 300_000).value, 0.4);
});

/* ─── Revenue（§13 §14 §15 / Test F） ──────────── */

const entry = (over = {}) => ({
  id: "r1",
  amountYen: 1000,
  sourceType: "note",
  occurredAt: "2026-09-13T00:00:00Z",
  confirmedByHuman: true,
  originTraceId: "tr1",
  ...over,
});

test("【重要】人の確認が無い収益は集計に含めない（§14）", () => {
  const result = revenue.summarizeRevenue([entry({ confirmedByHuman: false })]);
  assert.equal(result.aiGeneratedYen, 0);
  assert.equal(result.unconfirmedYen, 1000);
});

test("【重要】Test F: 投資利益は AI Generated Revenue に含めない（§15）", () => {
  const result = revenue.summarizeRevenue([
    entry({ id: "inv", sourceType: "investment", amountYen: 100_000 }),
  ]);
  assert.equal(result.aiGeneratedYen, 0);
  assert.equal(result.investmentYen, 100_000);
});

test("【重要】AI Companyの実行に紐づかない収益はAI収益にしない（§13）", () => {
  const result = revenue.summarizeRevenue([
    entry({ originTraceId: undefined, originAgentId: undefined }),
  ]);
  assert.equal(result.aiGeneratedYen, 0);
  assert.equal(result.otherBusinessYen, 1000);
});

test("実行に紐づく確認済み収益はAI収益になる", () => {
  const result = revenue.summarizeRevenue([entry()]);
  assert.equal(result.aiGeneratedYen, 1000);
});

/* ─── Achievement（§28 / Test D / Test F） ─────── */

test("【重要】Test D: AI収益1円で FIRST REVENUE が解除される", () => {
  const [first] = achievements.evaluateAchievements({ aiGeneratedRevenueYen: 1 });
  assert.equal(first.id, "first-revenue");
  assert.equal(first.unlocked, true);
  assert.ok(first.unlockedAt);
});

test("【重要】Test F: 投資利益だけでは FIRST REVENUE を解除しない", () => {
  // aiGeneratedRevenueYen は投資を除いた値。0なら解除されない
  const [first] = achievements.evaluateAchievements({ aiGeneratedRevenueYen: 0 });
  assert.equal(first.unlocked, false);
});

test("【重要】未計測（null）では解除しない", () => {
  const [first] = achievements.evaluateAchievements({ aiGeneratedRevenueYen: null });
  assert.equal(first.unlocked, false);
});

test("【重要】一度解除したら維持される（§28 重複解除しない）", () => {
  const [unlocked] = achievements.evaluateAchievements({ aiGeneratedRevenueYen: 1 });
  // 収益が0に戻っても解除は維持される
  const [again] = achievements.evaluateAchievements({
    aiGeneratedRevenueYen: 0,
    unlocked: [unlocked],
  });
  assert.equal(again.unlocked, true);
  assert.equal(again.unlockedAt, unlocked.unlockedAt);
});

/* ─── Mission（§34） ───────────────────────────── */

test("初期ミッションが常に存在する", () => {
  const mission = missions.firstRevenueMission({ aiGeneratedRevenueYen: null });
  assert.equal(mission.id, missions.FIRST_MISSION_ID);
  assert.equal(mission.status, "open");
});

test("達成済みならミッションは done", () => {
  const mission = missions.firstRevenueMission({ aiGeneratedRevenueYen: 100 });
  assert.equal(mission.status, "done");
});

/* ─── Company Health（§16〜§18 / Test G） ──────── */

const metricsWith = (over) => {
  const base = m.emptyPersonalMetrics();
  return {
    ...base,
    financial: { ...base.financial, ...(over.financial ?? {}) },
    productivity: { ...base.productivity, ...(over.productivity ?? {}) },
    organization: { ...base.organization, ...(over.organization ?? {}) },
  };
};

test("【重要】データが無い項目を0点にして全体を下げない（§17）", () => {
  // 測れたのは自動化率だけ。それが満点なら score は高く、coverage は低い
  const result = health.computeCompanyHealth({
    metrics: metricsWith({ productivity: { automationRate: m.available(100) } }),
  });
  assert.ok(result.score >= 90, `score=${result.score}`);
  assert.ok(result.coveragePct < 50, `coverage=${result.coveragePct}`);
});

test("カバレッジが測れた重みの割合になる", () => {
  const result = health.computeCompanyHealth({ metrics: m.emptyPersonalMetrics() });
  // セキュリティだけは指標が無くても評価できる（問題の有無で決まる）
  assert.ok(result.coveragePct > 0);
  assert.ok(result.coveragePct < 100);
});

test("【重要】Test G: 重大なセキュリティ問題があれば他が高くても AT_RISK（§18）", () => {
  const result = health.computeCompanyHealth({
    metrics: metricsWith({
      productivity: { automationRate: m.available(100) },
      organization: { taskSuccessRate: m.available(100), failureRate: m.available(0) },
    }),
    securityIssues: [
      { id: "s1", severity: "critical", description: "認証情報が露出しています" },
    ],
  });
  assert.equal(result.status, "AT_RISK");
  assert.ok(result.risks.length > 0);
});

test("問題が無ければ HEALTHY になりうる", () => {
  const result = health.computeCompanyHealth({
    metrics: metricsWith({
      productivity: { automationRate: m.available(100) },
      organization: { taskSuccessRate: m.available(100), failureRate: m.available(0) },
    }),
  });
  assert.equal(result.status, "HEALTHY");
});

test("警告レベルのセキュリティ問題は AT_RISK にしない", () => {
  const result = health.computeCompanyHealth({
    metrics: metricsWith({ productivity: { automationRate: m.available(100) } }),
    securityIssues: [{ id: "s1", severity: "warning", description: "軽微" }],
  });
  assert.notEqual(result.status, "AT_RISK");
});

/* ─── Department Health（§19） ─────────────────── */

test("部門ごとにHealthを出せる", () => {
  const result = health.computeDepartmentHealth({
    departmentId: "d1",
    name: "投資",
    taskSuccessRatePct: 90,
    failureRatePct: 10,
    averageLatencyMs: 1000,
    humanCorrectionRatePct: 5,
    costUsd: 1.2,
  });
  assert.ok(result.score > 80);
  assert.equal(result.coveragePct, 100);
});

test("【重要】部門固有の指標を持てる（投資とメディアを同じKPIで測らない）", () => {
  const result = health.computeDepartmentHealth({
    departmentId: "d1",
    name: "投資",
    taskSuccessRatePct: null,
    failureRatePct: null,
    averageLatencyMs: null,
    humanCorrectionRatePct: null,
    costUsd: null,
    specific: [{ label: "評価損益率", value: 12.3, unit: "%" }],
  });
  assert.equal(result.specific[0].label, "評価損益率");
  assert.equal(result.coveragePct, 0);
});
