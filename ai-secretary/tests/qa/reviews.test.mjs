/**
 * Daily / Weekly / Monthly Review（Phase 4 §22〜§25 / Test A）
 *
 * I/Oを伴う関数のため、ここでは Shadow Mode の維持と
 * レビューの組み立てロジックを純粋な部分で検証する。
 */

import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";

const OUT = path.join(process.env.QA_DIST, "out", "app", "lib", "company");
const analyzer = await import(path.join(OUT, "evolution", "patternAnalyzer.js"));
const thresholds = await import(path.join(OUT, "evolution", "thresholds.js"));
const fixtures = await import(path.join(OUT, "evolution", "fixtures.js"));

const TH = thresholds.defaultThresholds();
const NOW = fixtures.FIXTURE_NOW;

const org = {
  departments: [],
  agents: [],
  totals: { departments: 0, agents: 0, managers: 0, implementedSkills: 0, registeredSkills: 0, workflows: 0 },
  loadedAt: NOW.toISOString(),
};

/* ─── Test A: Shadow Mode が維持されている ───────── */

test("【重要】Test A: 20イベント未満なら INSUFFICIENT_DATA のまま", () => {
  const events = fixtures.filler(19);
  const result = analyzer.analyzePatterns(events, { thresholds: TH, organization: org, now: NOW });
  assert.equal(result.status, "INSUFFICIENT_DATA");
  assert.equal(result.patterns.length, 0);
});

test("Phase 4 の追加でも Shadow Mode の境界が変わっていない", () => {
  assert.equal(TH.minimumEventsForAnalysis, 20);

  const enough = analyzer.analyzePatterns(fixtures.filler(20), {
    thresholds: TH,
    organization: org,
    now: NOW,
  });
  assert.equal(enough.status, "OK");
});

/* ─── traceId が Workflow 検出に効くこと ─────────── */

test("【重要】traceIdが付いた一連の処理がWorkflow候補になる", () => {
  // Phase 3 の検出器は traceId が無いと動かなかった。
  // Phase 4 で traceId を記録するようにしたことの回帰確認
  const result = analyzer.analyzePatterns(
    [...fixtures.fixtureB(), ...fixtures.filler(20)],
    { thresholds: TH, organization: org, now: NOW }
  );
  assert.ok(
    result.patterns.some((p) => p.type === "WORKFLOW_CANDIDATE"),
    "traceIdからWorkflow候補が復元できていません"
  );
});

test("traceIdが無いイベントだけではWorkflow候補が出ない", () => {
  const noTrace = fixtures.filler(25);
  const result = analyzer.analyzePatterns(noTrace, {
    thresholds: TH,
    organization: org,
    now: NOW,
  });
  assert.equal(
    result.patterns.some((p) => p.type === "WORKFLOW_CANDIDATE"),
    false
  );
});
