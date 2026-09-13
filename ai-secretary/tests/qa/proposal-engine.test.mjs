/**
 * Proposal Engine / Score / Confidence（v3.1 Phase 3 §9〜§24）のテスト
 *
 * 最大の狙いは「データが薄いのにCEOへ提案が上がる」ことを防ぐこと。
 * 次に「何でも社員を増やそう」とならないこと（§22 §23 §24）。
 */

import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";

const OUT = path.join(process.env.QA_DIST, "out", "app", "lib", "company", "evolution");
const engine = await import(path.join(OUT, "proposalEngine.js"));
const score = await import(path.join(OUT, "proposalScore.js"));
const types = await import(path.join(OUT, "proposalTypes.js"));
const thresholds = await import(path.join(OUT, "thresholds.js"));

const TH = thresholds.defaultThresholds();
const NOW = new Date("2026-09-13T09:00:00Z");

const pattern = (over = {}) => ({
  type: "SKILL_CANDIDATE",
  key: "SKILL_CANDIDATE:v1|sales.followup_email",
  title: "followup_email をSkill化する候補",
  target: { departmentId: "sales", operation: "followup_email", skillId: "followup_email" },
  evidence: [{ label: "同一処理の発生", value: 8, unit: "件" }],
  sampleSize: 8,
  observationWindowDays: 14,
  detectedAt: NOW.toISOString(),
  ...over,
});

/* ─── Score（§12） ──────────────────────────────── */

test("配点の内訳を必ず保持する", () => {
  const breakdown = score.scorePattern(pattern(), "NEW_SKILL", TH);
  for (const key of [
    "taskFrequency", "timeSaving", "qualityImprovement",
    "costReduction", "ceoIntervention", "errorReduction", "strategicValue",
  ]) {
    assert.equal(typeof breakdown[key], "number", `${key} がありません`);
  }
});

test("各配点が上限を超えない", () => {
  const breakdown = score.scorePattern(pattern({ sampleSize: 999 }), "NEW_SKILL", TH);
  for (const [key, weight] of Object.entries(types.SCORE_WEIGHTS)) {
    assert.ok(breakdown[key] <= weight, `${key} が上限${weight}を超えています`);
  }
});

test("合計は0〜100に収まる", () => {
  const total = score.totalScore(score.scorePattern(pattern({ sampleSize: 999 }), "NEW_SKILL", TH));
  assert.ok(total >= 0 && total <= 100, `total=${total}`);
});

test("【重要】測れない項目は0点（憶測で点を盛らない）", () => {
  // 処理時間の根拠が無いので timeSaving は0
  const breakdown = score.scorePattern(pattern(), "NEW_SKILL", TH);
  assert.equal(breakdown.timeSaving, 0);
});

test("軽い変更ほど Strategic Value が高い（§23）", () => {
  const skill = score.scorePattern(pattern(), "NEW_SKILL", TH).strategicValue;
  const agent = score.scorePattern(pattern(), "NEW_AGENT", TH).strategicValue;
  const dept = score.scorePattern(pattern(), "NEW_DEPARTMENT", TH).strategicValue;
  assert.ok(skill > agent, `skill=${skill} agent=${agent}`);
  assert.ok(agent > dept, `agent=${agent} dept=${dept}`);
});

/* ─── Confidence（§14） ─────────────────────────── */

test("サンプルが多いほど確信度が上がる", () => {
  const low = score.computeConfidence(pattern({ sampleSize: 1 }), "NEW_SKILL", TH);
  const high = score.computeConfidence(pattern({ sampleSize: 20 }), "NEW_SKILL", TH);
  assert.ok(high > low);
});

test("【重要】重い提案ほど高い確信を要求する", () => {
  const p = pattern({ sampleSize: 5 });
  const skill = score.computeConfidence(p, "NEW_SKILL", TH);
  const dept = score.computeConfidence(p, "NEW_DEPARTMENT", TH);
  assert.ok(skill > dept, `skill=${skill} dept=${dept}`);
});

test("確信度は0〜1に収まる", () => {
  const c = score.computeConfidence(pattern({ sampleSize: 9999 }), "NEW_SKILL", TH);
  assert.ok(c >= 0 && c <= 1);
});

/* ─── しきい値（§13） ──────────────────────────── */

test("スコア85以上は HIGH_PRIORITY", () => {
  assert.equal(score.decideStatus(90, 0.9, 20, TH).status, "HIGH_PRIORITY");
});

test("スコア70〜84は PROPOSED", () => {
  assert.equal(score.decideStatus(75, 0.9, 20, TH).status, "PROPOSED");
});

test("スコア50〜69は WATCHING（CEOへ出さない）", () => {
  const decision = score.decideStatus(60, 0.9, 20, TH);
  assert.equal(decision.status, "WATCHING");
  assert.equal(decision.visibleToCeo, false);
});

test("【重要】§14の例: score 88 / confidence 0.31 / sampleSize 2 は WATCHING", () => {
  const decision = score.decideStatus(88, 0.31, 2, TH);
  assert.equal(decision.status, "WATCHING");
  assert.equal(decision.visibleToCeo, false);
  assert.ok(decision.heldReason);
});

test("【重要】サンプル不足はスコアが高くてもCEOへ出さない", () => {
  const decision = score.decideStatus(100, 1, 1, TH);
  assert.equal(decision.visibleToCeo, false);
  assert.match(decision.heldReason, /サンプル/);
});

/* ─── 重複防止（§16） ───────────────────────────── */

test("同じ提案は同じfingerprintになる", () => {
  const a = engine.proposalFingerprint("NEW_SKILL", { departmentId: "sales", skillId: "x" });
  const b = engine.proposalFingerprint("NEW_SKILL", { departmentId: "sales", skillId: "x" });
  assert.equal(a, b);
});

test("【重要】既存提案があれば新規作成せず更新する", () => {
  const first = engine.buildProposals([pattern()], { thresholds: TH, now: NOW });
  assert.equal(first.proposals.length, 1);

  const later = new Date(NOW.getTime() + 86_400_000);
  const second = engine.buildProposals([pattern({ sampleSize: 12 })], {
    thresholds: TH,
    existing: first.proposals,
    now: later,
  });

  assert.equal(second.proposals.length, 1);
  assert.equal(second.proposals[0].id, first.proposals[0].id);
  assert.equal(second.proposals[0].createdAt, first.proposals[0].createdAt);
  assert.notEqual(second.proposals[0].updatedAt, first.proposals[0].updatedAt);
});

test("【重要】履歴を上書きで消さない（§20）", () => {
  const first = engine.buildProposals([pattern()], { thresholds: TH, now: NOW });
  const second = engine.buildProposals([pattern({ sampleSize: 12 })], {
    thresholds: TH,
    existing: first.proposals,
    now: new Date(NOW.getTime() + 86_400_000),
  });
  assert.ok(
    second.proposals[0].history.length > first.proposals[0].history.length,
    "履歴が増えていません"
  );
  assert.equal(second.proposals[0].history[0].change, "created");
});

test("【重要】却下済みの提案は再提案しない（§18）", () => {
  const first = engine.buildProposals([pattern()], { thresholds: TH, now: NOW });
  const rejected = [{ ...first.proposals[0], status: "REJECTED", rejectionReason: "不要" }];
  const second = engine.buildProposals([pattern()], {
    thresholds: TH,
    existing: rejected,
    now: NOW,
  });
  assert.equal(second.proposals[0].status, "REJECTED");
  assert.equal(second.visible.length, 0);
});

/* ─── 組織の肥大化防止（§22 §23 §24） ──────────── */

test("提案は複雑性コストを持つ", () => {
  assert.equal(types.COMPLEXITY_BY_TYPE.NEW_SKILL, "low");
  assert.equal(types.COMPLEXITY_BY_TYPE.NEW_AGENT, "medium");
  assert.equal(types.COMPLEXITY_BY_TYPE.NEW_DEPARTMENT, "high");
});

test("推奨順位は Skill < Agent < Department（軽い順）", () => {
  assert.ok(types.RECOMMENDATION_RANK.NEW_SKILL < types.RECOMMENDATION_RANK.NEW_AGENT);
  assert.ok(types.RECOMMENDATION_RANK.NEW_AGENT < types.RECOMMENDATION_RANK.NEW_DEPARTMENT);
  assert.ok(types.RECOMMENDATION_RANK.PROMPT_UPDATE < types.RECOMMENDATION_RANK.NEW_SKILL);
});

test("【重要】同じ対象に軽い手段があれば重い提案を抑制する（§24）", () => {
  const light = {
    fingerprint: "NEW_SKILL:sales:-:x",
    type: "NEW_SKILL",
    targetDepartment: "sales",
    targetSkill: "x",
    recommendationRank: types.RECOMMENDATION_RANK.NEW_SKILL,
  };
  const heavy = {
    fingerprint: "NEW_DEPARTMENT:sales:-:x",
    type: "NEW_DEPARTMENT",
    targetDepartment: "sales",
    targetSkill: "x",
    recommendationRank: types.RECOMMENDATION_RANK.NEW_DEPARTMENT,
  };
  const suppressed = engine.suppressHeavierDuplicates([light, heavy]);
  assert.equal(suppressed.length, 1);
  assert.equal(suppressed[0].fingerprint, heavy.fingerprint);
});

/* ─── Evidence First（§11） ─────────────────────── */

test("【重要】提案は必ず根拠を持つ", () => {
  const { proposals } = engine.buildProposals([pattern()], { thresholds: TH, now: NOW });
  assert.ok(proposals[0].evidence.length > 0);
  assert.ok(proposals[0].sourcePatternKeys.length > 0);
});

test("提案はリスクを必ず持つ（空にしない）", () => {
  const { proposals } = engine.buildProposals([pattern()], { thresholds: TH, now: NOW });
  assert.ok(proposals[0].risks.length > 0);
});

test("REPEATED_TASK 単体では提案にしない（Skill候補が拾う）", () => {
  const { proposals } = engine.buildProposals([pattern({ type: "REPEATED_TASK" })], {
    thresholds: TH,
    now: NOW,
  });
  assert.equal(proposals.length, 0);
});

test("失敗率の高さは、まずプロンプト改善へ寄せる（§24）", () => {
  const { proposals } = engine.buildProposals(
    [pattern({ type: "HIGH_FAILURE_RATE", target: { agentId: "a1" } })],
    { thresholds: TH, now: NOW }
  );
  assert.equal(proposals[0].type, "PROMPT_UPDATE");
});

/* ─── Lifecycle（§17） ──────────────────────────── */

test("【重要】提案が自分で IMPLEMENTED になることはない", () => {
  const { proposals } = engine.buildProposals([pattern({ sampleSize: 999 })], {
    thresholds: TH,
    now: NOW,
  });
  for (const proposal of proposals) {
    assert.notEqual(proposal.status, "IMPLEMENTED");
    assert.notEqual(proposal.status, "APPROVED");
  }
});
