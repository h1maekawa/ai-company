/**
 * Personal AI Company の基盤（Phase 4 §1〜§3 / §5〜§9）のテスト
 */

import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";

const OUT = path.join(process.env.QA_DIST, "out", "app", "lib", "company");
const company = await import(path.join(OUT, "personalCompany.js"));
const trace = await import(path.join(OUT, "trace.js"));
const cost = await import(path.join(OUT, "cost.js"));
const goals = await import(path.join(OUT, "departmentGoals.js"));

/* ─── Company定義（§1 §2） ─────────────────────── */

test("Personal Company が定義されている", () => {
  assert.equal(company.PERSONAL_COMPANY.northStar, "economic_freedom");
  assert.equal(company.PERSONAL_COMPANY.currentGoal, "first_ai_revenue");
  assert.equal(company.PERSONAL_COMPANY.firstRevenueTargetYen, 1);
});

/* ─── Revenue Level（§3） ──────────────────────── */

test("収益0円は LV0", () => {
  assert.equal(company.computeRevenueLevel({ monthlyAiRevenueYen: 0 }).level, 0);
});

test("1円で LV1 に上がる", () => {
  assert.equal(company.computeRevenueLevel({ monthlyAiRevenueYen: 1 }).level, 1);
});

test("金額に応じてレベルが上がる", () => {
  assert.equal(company.computeRevenueLevel({ monthlyAiRevenueYen: 10_000 }).level, 3);
  assert.equal(company.computeRevenueLevel({ monthlyAiRevenueYen: 1_000_000 }).level, 8);
});

test("【重要】未計測は0円として扱わない", () => {
  const result = company.computeRevenueLevel({ monthlyAiRevenueYen: null });
  assert.equal(result.level, 0);
  assert.match(result.description, /未測定/);
  assert.equal(result.progressToNext, null);
});

test("生活費を100%カバーで LV9", () => {
  const result = company.computeRevenueLevel({
    monthlyAiRevenueYen: 0,
    livingCostCoverageRate: 1,
  });
  assert.equal(result.level, 9);
});

test("次のレベルへの進捗が出る", () => {
  const result = company.computeRevenueLevel({ monthlyAiRevenueYen: 500 });
  assert.equal(result.level, 1);
  assert.ok(result.progressToNext > 0 && result.progressToNext < 1);
});

/* ─── Execution Trace（§5 §6） ─────────────────── */

test("トレースを開始できる", () => {
  const ctx = trace.startTrace({ departmentId: "note" });
  assert.ok(ctx.traceId);
  assert.ok(ctx.startedAt);
  assert.equal(ctx.departmentId, "note");
});

test("【重要】子コンテキストは traceId を引き継ぐ（Test B）", () => {
  const root = trace.startTrace({ departmentId: "note", workflowId: "wf" });
  const research = trace.childContext(root, { agentId: "research" });
  const draft = trace.childContext(research, { agentId: "draft" });
  const publish = trace.childContext(draft, { agentId: "publish" });

  assert.equal(research.traceId, root.traceId);
  assert.equal(draft.traceId, root.traceId);
  assert.equal(publish.traceId, root.traceId);
});

test("【重要】子コンテキストで traceId を上書きできない", () => {
  const root = trace.startTrace();
  const child = trace.childContext(root, { traceId: "別のID" });
  assert.equal(child.traceId, root.traceId);
});

test("親トレースが記録される", () => {
  const root = trace.startTrace();
  const child = trace.childContext(root);
  assert.equal(child.parentTraceId, root.traceId);
});

test("contextを渡さなくても動く（既存呼び出しを壊さない・§6）", () => {
  const ctx = trace.ensureContext(undefined, { agentId: "a" });
  assert.ok(ctx.traceId);
  const existing = trace.startTrace();
  assert.equal(trace.ensureContext(existing).traceId, existing.traceId);
});

test("経過時間を測れる。壊れた開始時刻では null", () => {
  const ctx = trace.startTrace({}, new Date("2026-09-13T00:00:00Z"));
  assert.equal(trace.elapsedMs(ctx, new Date("2026-09-13T00:00:05Z")), 5000);
  assert.equal(trace.elapsedMs({ ...ctx, startedAt: "壊れた" }), null);
});

/* ─── Cost（§7） ───────────────────────────────── */

test("推定コストが渡されていれば確定する", () => {
  const result = cost.resolveCost({ estimatedCostUsd: 0.42 });
  assert.equal(result.known, true);
  assert.equal(result.usd, 0.42);
});

test("【重要】単価が分からないモデルは unknown（推測しない）", () => {
  const result = cost.resolveCost({ model: "未登録モデル", inputTokens: 100, outputTokens: 50 });
  assert.equal(result.known, false);
  assert.match(result.reason, /単価/);
});

test("【重要】トークン数が無ければ unknown", () => {
  const result = cost.resolveCost({ model: "x" });
  assert.equal(result.known, false);
});

/* ─── Retry（§8 / Test C） ─────────────────────── */

test("【重要】Test C: 3回目の試行なら retryCount は2", () => {
  const info = cost.retryInfo(3);
  assert.equal(info.attempt, 3);
  assert.equal(info.retryCount, 2);
});

test("初回は retryCount 0", () => {
  assert.equal(cost.retryInfo(1).retryCount, 0);
});

test("不正な試行回数は1に丸める", () => {
  assert.equal(cost.retryInfo(0).attempt, 1);
  assert.equal(cost.retryInfo(-5).attempt, 1);
});

/* ─── 部門の意味づけ（§20 §21） ────────────────── */

test("【重要】既存AI社員のIDを改名していない", () => {
  const mapped = goals.DEPARTMENT_GOAL_MAP.flatMap((m) => m.agentIds);
  assert.ok(mapped.includes("personal-fund"));
  assert.ok(mapped.includes("personal-note"));
});

test("AI社員から目的を引ける", () => {
  assert.equal(goals.goalOfAgent("personal-fund"), "wealth");
  assert.equal(goals.goalOfAgent("personal-note"), "media");
  assert.equal(goals.goalOfAgent("存在しない"), null);
});

test("§20の6つの目的がすべて表現できる", () => {
  const defined = new Set(goals.DEPARTMENT_GOAL_MAP.map((m) => m.goal));
  for (const goal of ["wealth", "income", "media", "business", "organization_evolution", "security"]) {
    assert.ok(defined.has(goal), `${goal} がありません`);
  }
});
