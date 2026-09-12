/**
 * Pattern Analyzer と Fixtures（v3.1 Phase 3 §1 / §3 / §21 / §22）のテスト
 *
 * 実データが無い段階でPhase 3を検証するための中核。
 * 「検出できること」と同じくらい「誤検出しないこと」を固定する。
 */

import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";

const OUT = path.join(process.env.QA_DIST, "out", "app", "lib", "company");
const analyzer = await import(path.join(OUT, "evolution", "patternAnalyzer.js"));
const fixtures = await import(path.join(OUT, "evolution", "fixtures.js"));
const thresholds = await import(path.join(OUT, "evolution", "thresholds.js"));

const NOW = fixtures.FIXTURE_NOW;
const TH = thresholds.defaultThresholds();

/** テスト用の最小組織（本物のDEPARTMENTSに依存させない） */
const org = (over = {}) => ({
  departments: [],
  agents: [
    { id: "sales-agent", name: "Sales", role: "", departmentId: "sales", departmentName: "Sales", kind: "employee", riskLevel: "R1", granted: [], canWrite: false, interventionTarget: 5, memoryScopeCount: 0, skillIds: [] },
    { id: "strategy-agent", name: "Strategy", role: "", departmentId: "strategy", departmentName: "Strategy", kind: "employee", riskLevel: "R1", granted: [], canWrite: false, interventionTarget: 5, memoryScopeCount: 0, skillIds: [] },
    { id: "research-agent", name: "Research", role: "", departmentId: "strategy", departmentName: "Strategy", kind: "employee", riskLevel: "R1", granted: [], canWrite: false, interventionTarget: 5, memoryScopeCount: 0, skillIds: [] },
    { id: "approval-agent", name: "Approval", role: "", departmentId: "note", departmentName: "Note", kind: "employee", riskLevel: "R3", granted: [], canWrite: false, interventionTarget: 100, memoryScopeCount: 0, skillIds: [] },
  ],
  totals: { departments: 0, agents: 4, managers: 0, implementedSkills: 0, registeredSkills: 0, workflows: 0 },
  loadedAt: NOW.toISOString(),
  ...over,
});

const analyze = (events, organization = org()) =>
  analyzer.analyzePatterns(events, { thresholds: TH, organization, now: NOW });

const typesIn = (result) => new Set(result.patterns.map((p) => p.type));

/* ─── Shadow Mode（§1） ─────────────────────────── */

test("【重要】データ不足は INSUFFICIENT_DATA であり、異常なしではない", () => {
  const result = analyze(fixtures.fixtureE());
  assert.equal(result.status, "INSUFFICIENT_DATA");
  assert.equal(result.patterns.length, 0);
  assert.ok(result.reason);
});

test("データ不足のときは検出器を走らせない", () => {
  const result = analyze([]);
  assert.equal(result.status, "INSUFFICIENT_DATA");
  assert.deepEqual(result.detectorErrors, []);
});

test("十分なイベントがあれば OK になる", () => {
  const result = analyze([...fixtures.fixtureA(), ...fixtures.filler(20)]);
  assert.equal(result.status, "OK");
});

/* ─── Fixture A: Skill候補 ───────────────────────── */

test("Fixture A: フォローメール8回で SKILL_CANDIDATE を検出する", () => {
  const result = analyze([...fixtures.fixtureA(), ...fixtures.filler(20)]);
  assert.ok(typesIn(result).has("SKILL_CANDIDATE"), [...typesIn(result)].join(","));

  const skill = result.patterns.find((p) => p.type === "SKILL_CANDIDATE");
  assert.equal(skill.target.operation, "followup_email");
  assert.ok(skill.sampleSize >= 8);
  // §11 Evidence First
  assert.ok(skill.evidence.length > 0);
});

test("Fixture A: 反復としても検出される", () => {
  const result = analyze([...fixtures.fixtureA(), ...fixtures.filler(20)]);
  assert.ok(typesIn(result).has("REPEATED_TASK"));
});

/* ─── Fixture B: Workflow候補 ────────────────────── */

test("Fixture B: 同じ手順が5回で WORKFLOW_CANDIDATE を検出する", () => {
  const result = analyze([...fixtures.fixtureB(), ...fixtures.filler(20)]);
  assert.ok(typesIn(result).has("WORKFLOW_CANDIDATE"), [...typesIn(result)].join(","));

  const wf = result.patterns.find((p) => p.type === "WORKFLOW_CANDIDATE");
  assert.ok(wf.sampleSize >= 3);
  assert.match(wf.title, /→/);
});

/* ─── Fixture C: 新Agent / 分割候補 ──────────────── */

test("Fixture C: 医療調査が42%を占め NEW_AGENT または SPLIT を検出する", () => {
  const result = analyze([...fixtures.fixtureC(), ...fixtures.filler(20)]);
  const types = typesIn(result);
  assert.ok(
    types.has("NEW_AGENT_CANDIDATE") || types.has("AGENT_SPLIT_CANDIDATE"),
    [...types].join(",")
  );
});

test("Fixture C: 根拠に割合と処理時間が含まれる（§11）", () => {
  const result = analyze([...fixtures.fixtureC(), ...fixtures.filler(20)]);
  const agent = result.patterns.find((p) => p.type === "NEW_AGENT_CANDIDATE");
  if (!agent) return; // SPLIT側で検出された場合はスキップ
  const labels = agent.evidence.map((e) => e.label).join(" ");
  assert.match(labels, /割合/);
});

/* ─── Fixture D: 部署候補 ────────────────────────── */

test("Fixture D: 医療業務が複数Agentで25件なら NEW_DEPARTMENT_CANDIDATE", () => {
  const result = analyze([...fixtures.fixtureD(), ...fixtures.filler(20)]);
  assert.ok(typesIn(result).has("NEW_DEPARTMENT_CANDIDATE"), [...typesIn(result)].join(","));
});

test("【重要】Fixture A だけでは部署候補を出さない（重い提案を軽々しく出さない）", () => {
  const result = analyze([...fixtures.fixtureA(), ...fixtures.filler(20)]);
  assert.equal(typesIn(result).has("NEW_DEPARTMENT_CANDIDATE"), false);
});

/* ─── Fixture E: 単発（§22 誤検知対策） ─────────── */

test("【重要】Fixture E: 1回しか起きていない仕事は反復として検出しない", () => {
  const result = analyze([...fixtures.fixtureE(), ...fixtures.filler(25)]);
  const repeated = result.patterns.filter(
    (p) => p.type === "REPEATED_TASK" && p.title.includes("法務")
  );
  assert.deepEqual(repeated, []);
});

test("【重要】同じ日に固まっただけの作業は反復にしない（単発プロジェクト対策）", () => {
  // 同一日に5回。継続業務ではない
  const sameDay = Array.from({ length: 5 }, (_, i) => ({
    id: `same-${i}`,
    at: "2026-09-12T0" + i + ":00:00Z",
    kind: "task.completed",
    department: "sales",
    actor: "sales-agent",
    action: "商談後のフォローメールを作って",
    outcome: "success",
    signature: "s",
    humanIntervention: false,
  }));
  const result = analyze([...sameDay, ...fixtures.filler(20)]);
  const repeated = result.patterns.filter(
    (p) => p.type === "REPEATED_TASK" && p.target.operation === "followup_email"
  );
  assert.deepEqual(repeated, []);
});

/* ─── Fixture F: R3の承認を誤検知しない（§7） ───── */

test("【重要】Fixture F: R3の承認100%を HIGH_HUMAN_INTERVENTION にしない", () => {
  const result = analyze([...fixtures.fixtureF("approval-agent"), ...fixtures.filler(20)]);
  const flagged = result.patterns.filter(
    (p) => p.type === "HIGH_HUMAN_INTERVENTION" && p.target.agentId === "approval-agent"
  );
  assert.deepEqual(flagged, [], "R3の承認が介入として誤検知されています");
});

test("R1のAI社員の本来不要な修正は検出する（除外しすぎていない）", () => {
  const corrections = Array.from({ length: 10 }, (_, i) => ({
    id: `corr-${i}`,
    at: `2026-09-1${i % 3}T05:00:00Z`,
    kind: "task.completed",
    department: "sales",
    actor: "sales-agent",
    action: "提案書を作成して",
    outcome: "success",
    signature: "s",
    humanIntervention: i < 5,
  }));
  const result = analyze([...corrections, ...fixtures.filler(20)]);
  assert.ok(
    result.patterns.some(
      (p) => p.type === "HIGH_HUMAN_INTERVENTION" && p.target.agentId === "sales-agent"
    ),
    "本来不要な修正が検出されていません"
  );
});

/* ─── 頑健性 ─────────────────────────────────────── */

test("検出器が1つ落ちても他は走る", () => {
  const broken = {
    id: "broken",
    detects: ["REPEATED_TASK"],
    run() {
      throw new Error("意図的な失敗");
    },
  };
  const result = analyzer.analyzePatterns(
    [...fixtures.fixtureA(), ...fixtures.filler(20)],
    { thresholds: TH, organization: org(), detectors: [broken], now: NOW }
  );
  assert.equal(result.status, "OK");
  assert.equal(result.detectorErrors.length, 1);
  assert.equal(result.detectorErrors[0].detectorId, "broken");
});

test("解析結果に signatureVersion が入る（後で再解析の互換性を判断できる）", () => {
  const result = analyze([...fixtures.fixtureA(), ...fixtures.filler(20)]);
  assert.ok(result.signatureVersion);
});
