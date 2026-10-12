import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

process.env.VAULT_ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "ai-company-creator-learning-"));
const DIST = process.env.CONTENT_DIST;
const creatorLearning = await import(path.join(DIST, "content/creator-thinking/creatorLearning.js"));
const creatorLearningStore = await import(path.join(DIST, "content/creator-thinking/creatorLearningStore.js"));
const modelVersioning = await import(path.join(DIST, "content/creator-thinking/modelVersioning.js"));
const modelVersioningStore = await import(path.join(DIST, "content/creator-thinking/modelVersioningStore.js"));
const types = await import(path.join(DIST, "content/creator-thinking/types.js"));

/* ─── section22: Human Feedback → Learning ─────────────────────────── */

test("HumanDecisionFeedback(departmentId:creator)からCreatorLearningArtifactが作れる", () => {
  const record = {
    departmentId: "creator",
    note: "この書き方は自分っぽい",
    decision: "APPROVED",
    targetType: "skill-candidate",
    targetId: "skill_candidate_1",
    createdAt: "2026-10-01T00:00:00.000Z",
  };
  const evidence = creatorLearning.projectHumanDecisionFeedback(record);
  assert.ok(evidence);
  assert.equal(evidence.sentiment, "positive");
  assert.equal(evidence.explicitness, "EXPLICIT");
  assert.equal(evidence.targetSkillId, "skill_candidate_1");

  const artifact = creatorLearning.buildCreatorLearningFromHumanFeedback(
    evidence,
    "human_decision_1",
    new Date("2026-10-13T00:00:00.000Z")
  );
  assert.equal(artifact.sourceType, "HUMAN_FEEDBACK");
  assert.equal(artifact.creatorFit, "HIGH");
  assert.equal(artifact.confidence, "high");
  assert.equal(artifact.sampleCount, 1);
  assert.deepEqual(artifact.evidenceRefs, ["human_decision_1"]);
});

test("departmentIdがcreatorでないHumanDecisionFeedbackはEvidence化しない", () => {
  const record = {
    departmentId: "fund",
    note: "テスト",
    decision: "APPROVED",
    targetType: "skill-candidate",
    targetId: "x",
    createdAt: "2026-10-01T00:00:00.000Z",
  };
  assert.equal(creatorLearning.projectHumanDecisionFeedback(record), null);
});

test("reasonが空のReviewFeedback（approve）はフィードバック化しない（学習材料が無いため）", () => {
  const record = { kind: "x_draft", itemId: "x_draft:abc", reason: "", decision: "approve", decidedAt: "2026-10-01T00:00:00.000Z" };
  assert.equal(creatorLearning.projectReviewFeedback(record), null);
});

test("ReviewFeedback(reject, reason有り)はnegative/EXPLICITなEvidenceになり、targetContentIdを保持する", () => {
  const record = {
    kind: "x_draft",
    itemId: "x_draft:draft_1",
    reason: "専門家ぶりすぎ",
    decision: "reject",
    decidedAt: "2026-10-01T00:00:00.000Z",
  };
  const evidence = creatorLearning.projectReviewFeedback(record);
  assert.equal(evidence.sentiment, "negative");
  assert.equal(evidence.targetContentId, "draft_1");
  assert.equal(evidence.category, "WRITING");
});

test("フィードバック文からcategoryを分類する（もっと調べたい→RESEARCH_DEPTH）", () => {
  assert.equal(creatorLearning.classifyCreatorLearningCategory("このテーマはもっと調べたい"), "RESEARCH_DEPTH");
  assert.equal(creatorLearning.classifyCreatorLearningCategory("冒頭のフックが弱い"), "HOOK");
  assert.equal(creatorLearning.classifyCreatorLearningCategory("普通の文体の話"), "WRITING");
});

/* ─── section3/9: Performance Learning と Creator Learning の分離 ──────── */

test("PerformanceからのCreatorLearningArtifactは常にcreatorFit:UNKNOWN（Performanceからcreator fitを推測しない）", () => {
  const artifact = creatorLearning.buildCreatorLearningFromPerformance(
    {
      sourceIds: ["content_1", "content_2", "content_3"],
      category: "HOOK",
      observation: "このHookパターンはImpressionsが高い",
      sampleCount: 5,
      observedAt: "2026-10-01T00:00:00.000Z",
    },
    new Date("2026-10-13T00:00:00.000Z")
  );
  assert.equal(artifact.sourceType, "PERFORMANCE");
  assert.equal(artifact.creatorFit, "UNKNOWN");
  assert.match(artifact.inferredPreference, /Creator Preferenceとしては未確認/);
});

test("CreatorFit評価からの学習はPerformanceを一切参照しない", () => {
  const evaluation = { id: "creatorfit_1", subjectId: "thesis_1", assessment: {}, reason: "自然な声ではない", fit: false, evaluatedAt: "2026-10-01T00:00:00.000Z" };
  const artifact = creatorLearning.buildCreatorLearningFromCreatorFit(evaluation, "WRITING", new Date("2026-10-13T00:00:00.000Z"));
  assert.equal(artifact.sourceType, "CREATOR_FIT");
  assert.equal(artifact.creatorFit, "LOW");
  for (const forbidden of ["impression", "engagement", "revenue"]) {
    assert.doesNotMatch(JSON.stringify(artifact).toLowerCase(), new RegExp(forbidden));
  }
});

/* ─── UNKNOWNを0やPASSとして推測しない ─────────────────────────────── */

test("観測日時が不正な場合、freshnessはUNKNOWNであり、FRESHへ推測しない", () => {
  const artifact = creatorLearning.buildCreatorLearningFromPerformance(
    { sourceIds: ["c1"], category: "TOPIC", observation: "obs", sampleCount: 1, observedAt: "not-a-date" },
    new Date("2026-10-13T00:00:00.000Z")
  );
  assert.equal(artifact.freshness, "UNKNOWN");
});

test("REPEATED_BEHAVIOR集約: creatorFitがHIGH/LOWで混在する場合はUNKNOWNへ安全側に倒す（どちらかに推測で寄せない）", () => {
  const now = new Date("2026-10-13T00:00:00.000Z");
  const high = creatorLearning.buildCreatorLearningFromCreatorFit(
    { id: "cf1", subjectId: "s1", assessment: {}, reason: "良い", fit: true, evaluatedAt: "2026-10-01T00:00:00.000Z" },
    "WRITING", now
  );
  const low = creatorLearning.buildCreatorLearningFromCreatorFit(
    { id: "cf2", subjectId: "s2", assessment: {}, reason: "悪い", fit: false, evaluatedAt: "2026-10-01T00:00:00.000Z" },
    "WRITING", now
  );
  const repeated = creatorLearning.buildRepeatedBehaviorArtifact([high, low], now);
  assert.equal(repeated.creatorFit, "UNKNOWN");
  assert.equal(repeated.sourceType, "REPEATED_BEHAVIOR");
});

test("CreatorLearningArtifactが1件未満ではREPEATED_BEHAVIORを作らない", () => {
  const now = new Date("2026-10-13T00:00:00.000Z");
  const single = creatorLearning.buildCreatorLearningFromCreatorFit(
    { id: "cf1", subjectId: "s1", assessment: {}, reason: "良い", fit: true, evaluatedAt: "2026-10-01T00:00:00.000Z" },
    "WRITING", now
  );
  assert.equal(creatorLearning.buildRepeatedBehaviorArtifact([single], now), null);
});

/* ─── Creator Learning Store: 第二Storeではないことの確認（append dedup） ────── */

test("同一sourceIdsからの重複Artifactはappendしない（append-onlyだが二重生成は防ぐ）", () => {
  const now = new Date("2026-10-13T00:00:00.000Z");
  const evidence = creatorLearning.projectHumanDecisionFeedback({
    departmentId: "creator", note: "この表現は使いたくない", decision: "REJECTED",
    targetType: "skill-candidate", targetId: "s1", createdAt: "2026-10-01T00:00:00.000Z",
  });
  const artifact = creatorLearning.buildCreatorLearningFromHumanFeedback(evidence, "human_decision_dup", now);
  const once = creatorLearningStore.appendCreatorLearningArtifact([], artifact);
  const twice = creatorLearningStore.appendCreatorLearningArtifact(once, { ...artifact, id: "different_id" });
  assert.equal(once.length, 1);
  assert.equal(twice.length, 1);
});

test("Creator Learning Store: 保存→読込が往復する（唯一のCreator Learning永続化先）", async () => {
  const now = new Date("2026-10-13T00:00:00.000Z");
  const evidence = creatorLearning.projectHumanDecisionFeedback({
    departmentId: "creator", note: "このテーマはもっと調べたい", decision: "HOLD",
    targetType: "skill-candidate", targetId: "s2", createdAt: "2026-10-01T00:00:00.000Z",
  });
  const artifact = creatorLearning.buildCreatorLearningFromHumanFeedback(evidence, "human_decision_roundtrip", now);
  await creatorLearningStore.saveCreatorLearningArtifacts([artifact]);
  const loaded = await creatorLearningStore.loadCreatorLearningArtifacts();
  assert.equal(loaded.length, 1);
  assert.equal(loaded[0].category, "RESEARCH_DEPTH");
});

/* ─── section12/14/16: Model Versioning / Protected Rule / Rollback ────── */

function baseModel() {
  return types.defaultCreatorThinkingModel({
    id: "ctm_1",
    owner: "maekawa",
    personality: { traits: [], basicStance: [], preferredExpressions: [], avoidedExpressions: [], writingRules: ["断定しすぎない"] },
    aiThinkingRules: types.AI_THINKING_STEPS,
    creatorFitRules: types.CREATOR_FIT_CRITERIA,
    investmentProjectionRules: ["Read-only Projectionのみ"],
  });
}

test("Protected Rule（Safety Gate等）はModelChangeCandidateのtargetRuleに選べない", () => {
  assert.throws(() => modelVersioning.assertEditableTargetRule("safetyGate"), modelVersioning.ProtectedRuleViolationError);
  assert.throws(() => modelVersioning.assertEditableTargetRule("investmentProjectionRules"), modelVersioning.ProtectedRuleViolationError);
  assert.doesNotThrow(() => modelVersioning.assertEditableTargetRule("writingRules"));
});

test("reason/proposedValueにProtected Boundary関連語が含まれるとModelChangeCandidateを作れない", () => {
  const model = baseModel();
  assert.throws(() => modelVersioning.createModelChangeCandidate({
    baseModel: model, changeType: "ruleAdded", targetRule: "writingRules",
    currentValue: "", proposedValue: "Investment HUMAN_ONLYを緩める",
    reason: "performanceのため", sourceSkillIds: ["skill_1"], sourceLearningIds: [], confidence: "high",
  }), modelVersioning.ProtectedRuleViolationError);
});

test("Evidence lineageが無い（sourceSkillIds/sourceLearningIdsが両方空）ModelChangeCandidateは作れない", () => {
  const model = baseModel();
  assert.throws(() => modelVersioning.createModelChangeCandidate({
    baseModel: model, changeType: "ruleAdded", targetRule: "writingRules",
    currentValue: "", proposedValue: "結論を先に書く",
    reason: "繰り返し観測された", sourceSkillIds: [], sourceLearningIds: [], confidence: "high",
  }), /EVIDENCE_LINEAGE_REQUIRED/);
});

test("ModelChangeCandidateのAPPROVED適用は新Versionを必ずDRAFTとして作る（AIが勝手にACTIVEへ書き換えない）", () => {
  const model = baseModel();
  const candidate = modelVersioning.createModelChangeCandidate({
    baseModel: model, changeType: "ruleAdded", targetRule: "writingRules",
    currentValue: "", proposedValue: "結論を先に書く",
    reason: "繰り返し観測された好み", sourceSkillIds: ["skill_1"], sourceLearningIds: ["learn_1"], confidence: "high",
  });
  const decided = modelVersioning.decideModelChangeCandidate(candidate, "APPROVED", "maekawa");
  const nextModel = modelVersioning.applyModelChangeCandidate(model, decided);
  assert.equal(nextModel.status, "DRAFT");
  assert.equal(nextModel.version, "0.2.0");
  assert.ok(nextModel.writingRules.includes("結論を先に書く"));
  assert.ok(nextModel.sourceFeedbackIds.includes("skill_1"));
  assert.ok(nextModel.sourceFeedbackIds.includes("learn_1"));
});

test("REJECTEDなModelChangeCandidateは適用できない", () => {
  const model = baseModel();
  const candidate = modelVersioning.createModelChangeCandidate({
    baseModel: model, changeType: "ruleAdded", targetRule: "writingRules",
    currentValue: "", proposedValue: "x",
    reason: "y", sourceSkillIds: ["skill_1"], sourceLearningIds: [], confidence: "low",
  });
  const decided = modelVersioning.decideModelChangeCandidate(candidate, "REJECTED", "maekawa");
  assert.throws(() => modelVersioning.applyModelChangeCandidate(model, decided), /MODEL_CHANGE_NOT_APPROVED/);
});

test("同時に複数ACTIVEは許されない。activateModelVersionは旧ACTIVEを自動でDEPRECATEDへ移す", () => {
  const v1 = { ...baseModel(), version: "1.0.0", status: "ACTIVE" };
  const v2 = { ...baseModel(), version: "1.1.0", status: "DRAFT" };
  const result = modelVersioning.activateModelVersion([v1, v2], "1.1.0", "maekawa", "新しい好みを反映");
  const actives = result.versions.filter((m) => m.status === "ACTIVE");
  assert.equal(actives.length, 1);
  assert.equal(actives[0].version, "1.1.0");
  assert.equal(result.versions.find((m) => m.version === "1.0.0").status, "DEPRECATED");
  assert.equal(result.history.previousVersion, "1.0.0");
  assert.equal(result.history.rollbackTarget, "1.0.0");
});

test("assertSingleActiveVersionは2つ以上ACTIVEがあると例外を投げる", () => {
  const v1 = { ...baseModel(), version: "1.0.0", status: "ACTIVE" };
  const v2 = { ...baseModel(), version: "1.1.0", status: "ACTIVE" };
  assert.throws(() => modelVersioning.assertSingleActiveVersion([v1, v2]), /MULTIPLE_ACTIVE_MODEL_VERSIONS/);
});

test("DRAFT以外はactivateできない（APPROVEDフローを経ずにACTIVE化しない）", () => {
  const deprecated = { ...baseModel(), version: "1.0.0", status: "DEPRECATED" };
  assert.throws(() => modelVersioning.activateModelVersion([deprecated], "1.0.0", "maekawa", "reason"), /ONLY_DRAFT_CAN_BE_ACTIVATED/);
});

test("approvedByが無いとactivateできない（Human Review必須）", () => {
  const draft = { ...baseModel(), version: "1.0.0", status: "DRAFT" };
  assert.throws(() => modelVersioning.activateModelVersion([draft], "1.0.0", "", "reason"), /APPROVER_REQUIRED/);
});

test("rollbackModelVersionはhistoryのrollbackTargetを再Activateする", () => {
  const v1 = { ...baseModel(), version: "1.0.0", status: "ACTIVE" };
  const v2 = { ...baseModel(), version: "1.1.0", status: "DRAFT" };
  const activated = modelVersioning.activateModelVersion([v1, v2], "1.1.0", "maekawa", "新バージョン");
  const rolledBack = modelVersioning.rollbackModelVersion(
    activated.versions,
    [activated.history],
    "maekawa",
    "やはり前のバージョンへ戻す"
  );
  const actives = rolledBack.versions.filter((m) => m.status === "ACTIVE");
  assert.equal(actives.length, 1);
  assert.equal(actives[0].version, "1.0.0");
  assert.equal(rolledBack.history.currentVersion, "1.0.0");
});

/* ─── Model Versioning Store: 唯一の永続化先（往復確認） ────────────────── */

test("Model Versioning Store: versions/historyが保存→読込で往復する", async () => {
  const v1 = { ...baseModel(), version: "1.0.0", status: "ACTIVE" };
  await modelVersioningStore.saveModelVersions({ versions: [v1], history: [] });
  const loaded = await modelVersioningStore.loadModelVersions();
  assert.equal(loaded.versions.length, 1);
  assert.equal(loaded.versions[0].status, "ACTIVE");
});

test("Model Change Candidate Store: 保存→読込が往復する", async () => {
  const model = baseModel();
  const candidate = modelVersioning.createModelChangeCandidate({
    baseModel: model, changeType: "ruleUpdated", targetRule: "creatorFitRules",
    currentValue: model.creatorFitRules[0], proposedValue: "より厳しい基準",
    reason: "繰り返し指摘された", sourceSkillIds: ["skill_2"], sourceLearningIds: [], confidence: "medium",
  });
  await modelVersioningStore.saveModelChangeCandidates([candidate]);
  const loaded = await modelVersioningStore.loadModelChangeCandidates();
  assert.equal(loaded.length, 1);
  assert.equal(loaded[0].status, "PENDING_REVIEW");
});
