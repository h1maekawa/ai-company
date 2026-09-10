/**
 * 自動承認（要件10）のテスト
 *
 * 既定を全工程「自動承認」にしたため、素通りを防ぐ唯一の関門が
 * canAutoApprove の条件になる。ここに偽の通過があると、
 * 検査されていないものが人の目に触れずに承認される。
 * そのため「通してはいけないケース」を重点的に固定する。
 */

import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";

const OUT = path.join(process.env.QA_DIST, "out", "app", "lib");
const policy = await import(path.join(OUT, "review", "approvalPolicy.js"));
const research = await import(path.join(OUT, "qa", "researchChecks.js"));

const AUTO = policy.defaultApprovalPolicy();

const qa = (over = {}) => ({
  targetId: "t",
  targetKind: "x_draft",
  checks: [],
  passed: true,
  blockingFailures: 0,
  warnings: 0,
  skipped: 0,
  ranAt: "2026-01-01T00:00:00Z",
  ...over,
});

/* ─── 既定値 ─────────────────────────────────────── */

test("既定は全工程が自動承認", () => {
  for (const phase of ["research", "writing", "seo", "publish"]) {
    assert.equal(AUTO[phase], "auto", `${phase} が auto ではありません`);
  }
});

test("壊れた保存値は既定へ倒れる", () => {
  assert.deepEqual(policy.normalizeApprovalPolicy(null), AUTO);
  assert.deepEqual(policy.normalizeApprovalPolicy("bad"), AUTO);
  assert.deepEqual(policy.normalizeApprovalPolicy({ research: "nonsense" }), AUTO);
  assert.equal(
    policy.normalizeApprovalPolicy({ publish: "human" }).publish,
    "human"
  );
});

/* ─── 自動承認の可否 ─────────────────────────────── */

test("自動承認: 工程がautoでテスト全通過なら承認する", () => {
  const verdict = policy.canAutoApprove({ phase: "publish", qa: qa() }, AUTO);
  assert.equal(verdict.approve, true);
});

test("工程がhumanなら、テストが通っていても承認しない", () => {
  const verdict = policy.canAutoApprove(
    { phase: "publish", qa: qa() },
    { ...AUTO, publish: "human" }
  );
  assert.equal(verdict.approve, false);
});

test("【重要】QAレポートが無いものは自動承認しない", () => {
  // 「テストが落ちていない」と「テストを通過した」は別物。
  // 検査対象外のものが素通りすると、要件10の前提が崩れる
  const verdict = policy.canAutoApprove({ phase: "research", qa: null }, AUTO);
  assert.equal(verdict.approve, false);
  assert.match(verdict.reason, /自動テストの結果がない/);
});

test("【重要】blockingが落ちていれば自動承認しない", () => {
  const verdict = policy.canAutoApprove(
    {
      phase: "publish",
      qa: qa({
        passed: false,
        blockingFailures: 1,
        checks: [
          { id: "x", label: "数値の裏取り", severity: "blocking", status: "fail", detail: "不一致" },
        ],
      }),
    },
    AUTO
  );
  assert.equal(verdict.approve, false);
  assert.match(verdict.reason, /数値の裏取り/);
});

test("【重要】未検証(skipped)が残っていれば自動承認しない", () => {
  // 参照元が無くて突合できなかった、という状態を「通過」にしない
  const verdict = policy.canAutoApprove(
    {
      phase: "publish",
      qa: qa({
        skipped: 1,
        checks: [
          { id: "f", label: "数値の裏取り", severity: "blocking", status: "skipped", detail: "参照元なし" },
        ],
      }),
    },
    AUTO
  );
  assert.equal(verdict.approve, false);
  assert.match(verdict.reason, /未検証/);
});

test("警告だけなら自動承認する（承認は止めない設計）", () => {
  const verdict = policy.canAutoApprove({ phase: "writing", qa: qa({ warnings: 2 }) }, AUTO);
  assert.equal(verdict.approve, true);
});

/* ─── リサーチ工程の検査 ─────────────────────────── */

const experience = (over = {}) => ({
  id: "e1",
  title: "体験",
  genres: [],
  summary: "まとめ",
  whatHappened: "起きたこと",
  whatWasTried: "試したこと",
  reusableFacts: [],
  sourceType: "manual",
  verifiedByUser: true,
  sensitive: false,
  createdAt: "2026-01-01T00:00:00Z",
  updatedAt: "2026-01-01T00:00:00Z",
  ...over,
});

const byId = (checks, id) => checks.find((c) => c.id === id);

test("【重要】本人未確認の体験は自動承認されない", () => {
  // runXSafetyGate は「本人確認済みの根拠がない体験表現」を止める前提。
  // 体験を人の確認なしに approved にすると、その前提が崩れる
  const report = research.runExperienceQa(experience({ verifiedByUser: false }));
  assert.equal(report.passed, false);
  assert.equal(policy.canAutoApprove({ phase: "research", qa: report }, AUTO).approve, false);
});

test("機微な体験は自動承認されない", () => {
  const report = research.runExperienceQa(experience({ sensitive: true }));
  assert.equal(report.passed, false);
});

test("数値を含む事実に裏付けが無ければ自動承認されない", () => {
  const report = research.runExperienceQa(
    experience({ reusableFacts: ["売上が120万円増えた"], evidence: [] })
  );
  assert.equal(byId(report.checks, "experience.numbers_need_evidence").status, "fail");
});

test("裏付けがあれば数値を含む体験も通過する", () => {
  const report = research.runExperienceQa(
    experience({ reusableFacts: ["売上が120万円増えた"], evidence: ["管理画面のスクリーンショット"] })
  );
  assert.equal(byId(report.checks, "experience.numbers_need_evidence").status, "pass");
});

test("根拠の無い視点は自動承認されない", () => {
  const report = research.runViewpointQa({
    id: "v1",
    title: "視点",
    topic: "AI",
    opinion: "意見",
    reasons: [],
    uncertainties: [],
    sourceDraftIds: [],
    reusable: true,
    verifiedByUser: false,
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
  });
  assert.equal(byId(report.checks, "viewpoint.reasons").status, "fail");
  assert.equal(report.passed, false);
});

test("実績に紐づかない学びは未検証として残り、自動承認されない", () => {
  const report = research.runLearningQa({
    id: "l1",
    period: "2026-W01",
    sourceContentIds: [],
    sourcePerformanceIds: [],
    observation: "観測",
    interpretation: "解釈",
    status: "candidate",
    createdAt: "2026-01-01T00:00:00Z",
  });
  assert.equal(byId(report.checks, "learning.sources").status, "skipped");
  assert.equal(policy.canAutoApprove({ phase: "research", qa: report }, AUTO).approve, false);
});
