import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const cc = require(path.join(process.env.QA_DIST, "out/app/lib/mobile-ceo/controlCenter.js"));
const { buildDepartmentReadModel } = require(path.join(process.env.QA_DIST, "out/app/lib/mobile-ceo/departments.js"));

test("円は表示だけ丸める: 2101419.94 → ¥2,101,420", () => {
  const raw = 2101419.94;
  assert.equal(cc.formatYen(raw), "¥2,101,420");
  assert.equal(raw, 2101419.94, "内部値は丸めない");
  assert.equal(cc.formatYen(123456, { sign: true }), "+¥123,456");
  assert.equal(cc.formatYen(-5000.4), "-¥5,000");
  assert.equal(cc.formatMetricValue({ value: raw, unit: "円" }), "¥2,101,420");
});

test("Backend UNKNOWN は CEO UI で「未取得」。0 とは区別する", () => {
  assert.equal(cc.displayStatus("UNKNOWN"), "未取得");
  assert.equal(cc.displayStatus("HEALTHY"), "HEALTHY");
  assert.equal(cc.formatYen(null), "未取得");
  assert.equal(cc.formatMetricValue({ value: null, unit: "円" }), "未取得");
  assert.equal(cc.formatMetricValue({ value: 0, unit: "円" }), "¥0", "実測0は0のまま");
  const model = buildDepartmentReadModel("creator", { economics: { outcome: { revenueStatus: "UNKNOWN", costStatus: "UNKNOWN" } }, content: {} });
  assert.equal(model.outcomes.find((x) => x.metric === "revenue").availability, "UNKNOWN", "Backend enumは変更しない");
});

test("現在稼働率: WAITING_APPROVAL は稼働中に含めず、total=0 は UNKNOWN", () => {
  const summary = cc.computeEmployeeUtilization(["EXECUTING", "RESEARCHING", "WAITING_APPROVAL", "IDLE"]);
  assert.equal(summary.active, 2);
  assert.equal(summary.waitingApproval, 1);
  assert.equal(summary.idle, 1);
  assert.equal(summary.utilization, 0.5);
  assert.equal(summary.basis, "CURRENT_MISSION_STATE");
  assert.equal(cc.computeEmployeeUtilization([]).utilization, null);
  assert.equal(cc.computeEmployeeUtilization(["UNKNOWN"]).unknown, 1);
});

test("Revenue未記録だけではCEO確認にしない。取得エラー・Revenue待ち停止だけ昇格する", () => {
  const unknownOnly = buildDepartmentReadModel("creator", { economics: { outcome: { revenueStatus: "UNKNOWN", costStatus: "UNKNOWN" } }, content: {} });
  assert.deepEqual(unknownOnly.problems, []);
  assert.deepEqual(unknownOnly.attention, []);
  assert.equal(unknownOnly.outcomes.find((x) => x.metric === "revenue").value, null);
  const ledgerError = buildDepartmentReadModel("creator", { economics: null, content: {} });
  assert.equal(ledgerError.attention[0].type, "ACTION_REQUIRED");
  assert.equal(ledgerError.problems.length, 1);
  const blocked = cc.creatorRevenueAttention({ economicsAvailable: true, workflows: [{ id: "m1", title: "有料記事化", steps: [{ status: "BLOCKED", inputRefs: ["revenue:ledger"], outputRefs: [] }] }] });
  assert.equal(blocked.length, 1);
  assert.equal(cc.creatorRevenueAttention({ economicsAvailable: true, workflows: [{ id: "m2", title: "x", steps: [{ status: "BLOCKED", inputRefs: ["research:1"], outputRefs: [] }] }] }).length, 0);
});

test("Creatorの現在の仕事は実在Workflowだけ。Generic Opportunityは別fieldへ", () => {
  const model = buildDepartmentReadModel("creator", { economics: { outcome: {} }, content: {}, opportunities: { opportunities: [{ title: "発信から収益導線を作る" }] }, execution: { state: { missions: [], plans: [] } } });
  assert.deepEqual(model.currentWork, []);
  assert.deepEqual(model.opportunities, ["発信から収益導線を作る"]);
});

test("Skill Proposalの部門判定は allowedSecretaries と所属AI社員の intersection", () => {
  const skills = [{ id: "content-kpi-analysis", allowedSecretaries: ["creator-kpi"] }, { id: "fund-log-format", allowedSecretaries: ["personal-fund"] }, { id: "creator-named-but-unassigned", allowedSecretaries: [] }];
  assert.deepEqual(cc.departmentSkillIds(skills, ["personal-note", "creator-content", "creator-research", "creator-kpi"]), ["content-kpi-analysis"]);
  assert.deepEqual(cc.departmentSkillIds(skills, ["personal-fund", "fund-research"]), ["fund-log-format"]);
});

test("CEO補足は append-only で、元Proposalを変えず、実装・Registry・Policyを変更しない", () => {
  const proposal = Object.freeze({ id: "skill_improvement_1", status: "PROPOSED" });
  const first = cc.createHumanDecisionFeedback({ id: "h1", targetType: "skill-improvement", targetId: proposal.id, decision: "APPROVED", note: "  noteにも同じ基準を<script>  " });
  assert.equal(first.note, "noteにも同じ基準を<script>", "テキストとして保存し、Reactで描画時にエスケープされる");
  assert.equal(first.codeChanged, false); assert.equal(first.registryChanged, false); assert.equal(first.policyChanged, false); assert.equal(first.engineeringStarted, false);
  assert.equal(first.confirmedByHuman, true);
  const existing = [first];
  const second = cc.createHumanDecisionFeedback({ id: "h2", targetType: "skill-improvement", targetId: proposal.id, decision: "HOLD" });
  const next = cc.appendHumanDecisionFeedback(existing, second);
  assert.equal(existing.length, 1, "既存配列を変更しない");
  assert.deepEqual(next.map((x) => x.id), ["h1", "h2"]);
  assert.equal(second.note, null);
  assert.equal(cc.sanitizeHumanNote("a".repeat(1500)).length, 1000);
  assert.equal(cc.latestDecisionFor(next, "skill-improvement", proposal.id).id, "h2");
  assert.equal(proposal.status, "PROPOSED");
});

test("KPI目標は人間の確認なしには保存できない", () => {
  assert.throws(() => cc.validateKpiGoalInput({ metric: "x_impressions", target: 20000, period: "weekly" }, "creator"), /HUMAN_CONFIRMATION_REQUIRED/);
  assert.throws(() => cc.validateKpiGoalInput({ metric: "x_impressions", target: 1, period: "yearly", confirmedByHuman: true }, "creator"), /INVALID_PERIOD/);
  assert.throws(() => cc.validateKpiGoalInput({ metric: "x", target: -1, period: "daily", confirmedByHuman: true }, "creator"), /INVALID_TARGET/);
  assert.throws(() => cc.validateKpiGoalInput({ metric: "x", target: 1, period: "daily", confirmedByHuman: true }, "engineering"), /NOT_SUPPORTED/);
  const goal = cc.validateKpiGoalInput({ metric: "x_impressions", target: 20000, period: "weekly", confirmedByHuman: true, note: "まずはX" }, "creator", new Date("2026-09-24T00:00:00Z"));
  assert.deepEqual(goal, { departmentId: "creator", metric: "x_impressions", target: 20000, period: "weekly", note: "まずはX", confirmedByHuman: true, updatedAt: "2026-09-24T00:00:00.000Z" });
  const goals = cc.upsertKpiGoal(cc.upsertKpiGoal([], goal), { ...goal, target: 25000 });
  assert.equal(goals.length, 1); assert.equal(goals[0].target, 25000);
});

test("Thesis AlertはWEAKENED/INVALIDATEDの最新observationだけ。株価下落はAlertにしない", () => {
  assert.equal(cc.thesisAlertCount(null), null);
  const outcomes = [
    { decisionId: "d1", observedAt: "2026-09-01", thesisStatus: "WEAKENED", priceChangePct: -2 },
    { decisionId: "d1", observedAt: "2026-09-20", thesisStatus: "MAINTAINED", priceChangePct: -15 },
    { decisionId: "d2", observedAt: "2026-09-10", thesisStatus: "INVALIDATED" },
    { decisionId: "d3", observedAt: "2026-09-10", thesisStatus: null, priceChangePct: -30 },
  ];
  assert.equal(cc.thesisAlertCount(outcomes), 1);
  const model = buildDepartmentReadModel("fund", { recommendations: { recommendations: [] }, transactions: { transactions: [] }, learning: { learnings: [] }, outcomes: { outcomes } });
  assert.equal(model.operations.find((x) => x.metric === "thesis_alerts").value, 1);
  const missing = buildDepartmentReadModel("fund", { recommendations: { recommendations: [] }, transactions: { transactions: [] }, learning: { learnings: [] } });
  assert.equal(missing.operations.find((x) => x.metric === "thesis_alerts").availability, "UNKNOWN");
});

test("Next Reviewは実データのnextReviewAtだけ。無ければ未取得", () => {
  const now = new Date("2026-09-24T00:00:00Z");
  assert.equal(cc.nextReviewAt([], now), null);
  assert.deepEqual(cc.nextReviewAt([{ ticker: "MU", nextReviewAt: "2026-09-01T00:00:00Z" }, { ticker: "ASML", nextReviewAt: "2026-10-02T00:00:00Z" }], now), { at: "2026-10-02T00:00:00Z", ticker: "ASML" });
  const model = buildDepartmentReadModel("fund", { recommendations: { recommendations: [] }, transactions: { transactions: [] }, learning: { learnings: [] } });
  const review = model.operations.find((x) => x.metric === "next_review");
  assert.equal(review.value, null); assert.equal(review.displayValue, undefined);
});

test("Research PolicyのresearcherAgentIdはAgent Registryに実在する（Fundはfund-research）", () => {
  const root = path.join(process.env.QA_DIST, "out");
  const { DEPARTMENT_RESEARCH_POLICIES, researchPolicy } = require(path.join(root, "app/lib/company/research/policies.js"));
  const { getSecretaryById } = require(path.join(root, "app/lib/config/departments.js"));
  const { DEPARTMENT_NAV_BY_ID } = require(path.join(root, "app/lib/config/navigation.js"));
  // AI社員ではなくローカルのEngineering Worker processを指す既知の例外。ここに無いIDは実在必須。
  const NON_REGISTRY_RESEARCHERS = new Set(["engineering-worker"]);
  for (const policy of DEPARTMENT_RESEARCH_POLICIES) {
    if (NON_REGISTRY_RESEARCHERS.has(policy.researcherAgentId)) continue;
    assert.ok(getSecretaryById(policy.researcherAgentId), `${policy.departmentId}: ${policy.researcherAgentId} はAgent Registryに存在しません`);
  }
  const fund = researchPolicy("fund");
  assert.equal(fund.researcherAgentId, "fund-research");
  assert.equal(getSecretaryById("fund-research").departmentRole, "research");
  assert.ok(DEPARTMENT_NAV_BY_ID.fund.employeeIds.includes(fund.researcherAgentId), "Fund所属AI社員であること");
});

test("Human Decision Feedbackはsilent truncationしない（501件超でも古い判断が残る）", () => {
  const proposal = Object.freeze({ id: "skill_improvement_x", status: "PROPOSED", body: "AI提案本文" });
  const existing = Array.from({ length: 501 }, (_, i) => cc.createHumanDecisionFeedback({ id: `h${i}`, targetType: "skill-improvement", targetId: proposal.id, decision: "HOLD", now: new Date(Date.UTC(2026, 0, 1, 0, 0, i)) }));
  const snapshot = existing.map((record) => record.id);
  const record = cc.createHumanDecisionFeedback({ id: "h-new", targetType: "skill-improvement", targetId: proposal.id, decision: "APPROVED", note: "CEO補足" });
  const next = cc.appendHumanDecisionFeedback(existing, record);
  assert.equal(next.length, 502);
  assert.equal(next[0].id, "h0", "最古のrecordが残る");
  assert.equal(next.at(-1).id, "h-new", "新しいrecordは末尾");
  assert.deepEqual(existing.map((r) => r.id), snapshot, "既存配列をmutationしない");
  assert.equal(existing.length, 501);
  assert.deepEqual(proposal, { id: "skill_improvement_x", status: "PROPOSED", body: "AI提案本文" }, "元Proposalは変更されない");
  for (const item of next) {
    assert.equal(item.codeChanged, false); assert.equal(item.registryChanged, false);
    assert.equal(item.policyChanged, false); assert.equal(item.engineeringStarted, false);
  }
  assert.equal(cc.appendHumanDecisionFeedback.length, 2, "件数上限パラメータを持たない");
});
