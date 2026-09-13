/**
 * Bottleneck Analyzer（v3.1 Phase 3 §8）のテスト
 *
 * Pattern Analyzer とは別責務。ここは数字を出すところまで。
 * 測れなかったものを0で埋めないことを重点的に固定する。
 */

import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";

const OUT = path.join(process.env.QA_DIST, "out", "app", "lib", "company", "evolution");
const bottleneck = await import(path.join(OUT, "bottleneckAnalyzer.js"));
const thresholds = await import(path.join(OUT, "thresholds.js"));

const TH = thresholds.defaultThresholds();
const NOW = new Date("2026-09-13T09:00:00Z");
const hoursAgo = (h) => new Date(NOW.getTime() - h * 3_600_000).toISOString();

const org = {
  departments: [],
  agents: [
    { id: "a1", name: "A1", role: "", departmentId: "d", departmentName: "D", kind: "employee", riskLevel: "R1", granted: [], canWrite: false, interventionTarget: 5, memoryScopeCount: 0, skillIds: [] },
    { id: "a2", name: "A2", role: "", departmentId: "d", departmentName: "D", kind: "employee", riskLevel: "R3", granted: [], canWrite: false, interventionTarget: 100, memoryScopeCount: 0, skillIds: [] },
  ],
  totals: { departments: 0, agents: 2, managers: 0, implementedSkills: 0, registeredSkills: 0, workflows: 0 },
  loadedAt: NOW.toISOString(),
};

const ev = (over = {}) => ({
  id: `e${Math.random()}`,
  at: hoursAgo(5),
  kind: "task.completed",
  department: "d",
  actor: "a1",
  action: "作業",
  outcome: "success",
  signature: "s",
  humanIntervention: false,
  ...over,
});

const analyze = (events) =>
  bottleneck.analyzeBottlenecks(events, { thresholds: TH, organization: org, now: NOW });

test("データ不足は INSUFFICIENT_DATA（異常なしではない）", () => {
  const report = analyze([ev(), ev()]);
  assert.equal(report.status, "INSUFFICIENT_DATA");
  assert.equal(report.overallAvgLatencyMs, null);
});

test("十分なイベントがあれば OK", () => {
  const report = analyze(Array.from({ length: 25 }, () => ev()));
  assert.equal(report.status, "OK");
  assert.equal(report.totalTasks, 25);
});

test("【重要】処理時間が測れないときは null（0で埋めない）", () => {
  const report = analyze(Array.from({ length: 25 }, () => ev()));
  assert.equal(report.overallAvgLatencyMs, null);
  assert.equal(report.agents[0].avgLatencyMs, null);
  assert.equal(report.agents[0].latencyVsAverage, null);
});

test("【重要】retriesが未記録なら再試行率は null（0%ではない）", () => {
  const report = analyze(Array.from({ length: 25 }, () => ev()));
  assert.equal(report.agents[0].retryRatePct, null);
});

test("コストが未記録なら null", () => {
  const report = analyze(Array.from({ length: 25 }, () => ev()));
  assert.equal(report.agents[0].costUsd, null);
});

test("タスク集中をflagで示す", () => {
  const events = [
    ...Array.from({ length: 24 }, () => ev({ actor: "a1" })),
    ev({ actor: "a2" }),
  ];
  const report = analyze(events);
  const a1 = report.agents.find((a) => a.agentId === "a1");
  assert.ok(a1.sharePct > 90);
  assert.ok(a1.flags.includes("タスク集中"));
});

test("失敗率を計算しflagを立てる", () => {
  const events = [
    ...Array.from({ length: 10 }, () => ev({ outcome: "failure" })),
    ...Array.from({ length: 15 }, () => ev()),
  ];
  const report = analyze(events);
  const a1 = report.agents.find((a) => a.agentId === "a1");
  assert.equal(a1.failureRatePct, 40);
  assert.ok(a1.flags.includes("失敗率"));
});

test("処理時間が全体平均より大幅に長いとflagが立つ", () => {
  const events = [
    ...Array.from({ length: 12 }, () => ev({ actor: "a1", latencyMs: 200_000 })),
    ...Array.from({ length: 13 }, () => ev({ actor: "a2", latencyMs: 20_000 })),
  ];
  const report = analyze(events);
  const a1 = report.agents.find((a) => a.agentId === "a1");
  assert.ok(a1.latencyVsAverage > 1.5, `倍率=${a1.latencyVsAverage}`);
  assert.ok(a1.flags.includes("処理時間"));
});

test("【重要】R3のAI社員の人の関与は修正率に数えない（§7）", () => {
  const events = [
    ...Array.from({ length: 12 }, () => ev({ actor: "a2", humanIntervention: true })),
    ...Array.from({ length: 13 }, () => ev({ actor: "a1" })),
  ];
  const report = analyze(events);
  const a2 = report.agents.find((a) => a.agentId === "a2");
  assert.equal(a2.correctionRatePct, 0, "R3の関与が修正として数えられています");
});

test("Skillごとの集中度を出す", () => {
  const events = [
    ...Array.from({ length: 15 }, () => ev({ skillId: "s1" })),
    ...Array.from({ length: 10 }, () => ev({ skillId: "s2" })),
  ];
  const report = analyze(events);
  assert.equal(report.skills[0].skillId, "s1");
  assert.equal(report.skills[0].tasks, 15);
});
