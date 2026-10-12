import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const read = (file) => fs.readFileSync(file, "utf8");

const dist = process.env.ARCHITECTURE_DIST;
const skillCandidates = await import(path.join(dist, "company/evolution/skillCandidates.js"));
const skillPromotionBridge = await import(path.join(dist, "content/creator-thinking/skillPromotionBridge.js"));

function baseCandidate(overrides = {}) {
  return {
    id: "skill_candidate_test",
    patternSignature: "creator|WRITING",
    name: "creator-writing-test",
    purpose: "テスト用",
    departmentId: "creator",
    sourceMissionIds: [],
    sourceKnowledgeIds: ["evidence_1", "evidence_2"],
    repeatedSteps: ["creator-writing-preference"],
    usageCount: 3,
    suggestedAgents: ["creator-content"],
    suggestedCategory: "generation",
    inputDescription: "test",
    outputDescription: "test",
    reason: "test",
    existingSimilarSkillIds: [],
    status: "APPROVED",
    createdAt: "2026-10-01T00:00:00.000Z",
    updatedAt: "2026-10-01T00:00:00.000Z",
    lastObservedAt: "2026-10-01T00:00:00.000Z",
    executable: false,
    engineeringRequestAllowed: false,
    registryMutationAllowed: false,
    sampleCount: 3,
    creatorFit: "HIGH",
    ...overrides,
  };
}

/* ─── section8: 1投稿だけでは昇格不可 ─────────────────────────────── */

test("sampleCountが1のSkillCandidateはINSUFFICIENT_DATA（single-post promotion禁止）", () => {
  const decision = skillCandidates.evaluateSkillPromotion(baseCandidate({ sampleCount: 1, sourceKnowledgeIds: ["evidence_1"] }));
  assert.equal(decision, "INSUFFICIENT_DATA");
});

test("独立Evidenceが1件以下ならINSUFFICIENT_DATA（複数の独立したポストが必要）", () => {
  const decision = skillCandidates.evaluateSkillPromotion(baseCandidate({ sampleCount: 5, sourceKnowledgeIds: ["evidence_1"] }));
  assert.equal(decision, "INSUFFICIENT_DATA");
});

/* ─── section9: Creator Fit LOWなら自動昇格不可。Performanceだけで決めない ─────── */

test("creatorFit:LOWはPerformanceがどれだけ良くても自動でPROMOTEしない", () => {
  const decision = skillCandidates.evaluateSkillPromotion(baseCandidate({ creatorFit: "LOW", performanceImpact: "HIGH" }));
  assert.equal(decision, "KEEP_CANDIDATE");
});

test("creatorFitがUNKNOWNの場合はPASSや昇格として扱わずINSUFFICIENT_DATAにする", () => {
  const decision = skillCandidates.evaluateSkillPromotion(baseCandidate({ creatorFit: "UNKNOWN" }));
  assert.equal(decision, "INSUFFICIENT_DATA");
  const decisionMissing = skillCandidates.evaluateSkillPromotion(baseCandidate({ creatorFit: undefined }));
  assert.equal(decisionMissing, "INSUFFICIENT_DATA");
});

/* ─── section10: PROMOTEにはHuman Reviewを要求する ───────────────────── */

test("statusがAPPROVED以外（Human Reviewを経ていない）ならPROMOTEにならない", () => {
  const decision = skillCandidates.evaluateSkillPromotion(baseCandidate({ status: "PROPOSED" }));
  assert.equal(decision, "KEEP_CANDIDATE");
});

test("全条件を満たせばPROMOTE", () => {
  const decision = skillCandidates.evaluateSkillPromotion(baseCandidate());
  assert.equal(decision, "PROMOTE");
});

test("promoteSkillCandidateToActiveはAPPROVED以外から呼べない", () => {
  assert.throws(
    () => skillCandidates.promoteSkillCandidateToActive(baseCandidate({ status: "PROPOSED" }), "maekawa"),
    /SKILL_CANDIDATE_NOT_APPROVED/
  );
});

test("promoteSkillCandidateToActiveはpromotion gateを満たさないと例外を投げる", () => {
  assert.throws(
    () => skillCandidates.promoteSkillCandidateToActive(baseCandidate({ sampleCount: 1, sourceKnowledgeIds: ["e1"] }), "maekawa"),
    /PROMOTION_GATE_NOT_SATISFIED/
  );
});

test("promoteSkillCandidateToActiveはapprovedByが無いと例外を投げる", () => {
  assert.throws(() => skillCandidates.promoteSkillCandidateToActive(baseCandidate(), ""), /APPROVER_REQUIRED/);
});

test("ACTIVEになってもexecutable/engineeringRequestAllowed/registryMutationAllowedはfalseのまま（実行権限を持たない不変条件）", () => {
  const active = skillCandidates.promoteSkillCandidateToActive(baseCandidate(), "maekawa");
  assert.equal(active.status, "ACTIVE");
  assert.equal(active.executable, false);
  assert.equal(active.engineeringRequestAllowed, false);
  assert.equal(active.registryMutationAllowed, false);
});

test("deprecateSkillCandidateはACTIVE以外から呼べず、理由が必須", () => {
  const active = skillCandidates.promoteSkillCandidateToActive(baseCandidate(), "maekawa");
  assert.throws(() => skillCandidates.deprecateSkillCandidate(active, "", undefined), /DEPRECATION_REASON_REQUIRED/);
  const deprecated = skillCandidates.deprecateSkillCandidate(active, "より良いSkillへ置き換え", "skill_candidate_new");
  assert.equal(deprecated.status, "DEPRECATED");
  assert.equal(deprecated.replacementSkillId, "skill_candidate_new");
});

/* ─── 既存status体系の再利用（新しい並行enumを作らない） ───────────────── */

test("SkillCandidateStatusは既存4値(PROPOSED/APPROVED/REJECTED/HOLD)を保ったままACTIVE/DEPRECATEDを追加しただけ", () => {
  const source = read("app/lib/company/evolution/skillCandidates.ts");
  assert.match(source, /"PROPOSED" \| "APPROVED" \| "REJECTED" \| "HOLD" \| "ACTIVE" \| "DEPRECATED"/);
});

/* ─── 第二Skill Storeを作らない ───────────────────────────────────── */

test("skillPromotionBridgeは既存SkillCandidate型をimportするだけで、新しいStore（saveVaultFile等）を持たない", () => {
  const source = read("app/lib/content/creator-thinking/skillPromotionBridge.ts");
  assert.match(source, /from "\.\.\/\.\.\/company\/evolution\/skillCandidates"/);
  assert.doesNotMatch(source, /saveVaultFile|getVaultFile|ExecutionState\s*=/);
});

test("deriveCreatorSkillCandidatesFromLearningはExecutionState.skillCandidates互換の配列を返す（既存配列へ追記する形）", () => {
  const existing = [];
  const artifact = {
    id: "learn_1", sourceType: "HUMAN_FEEDBACK", sourceIds: ["h1"], category: "WRITING",
    observation: "obs", inferredPreference: "pref", evidenceRefs: ["h1", "h2"],
    creatorFit: "HIGH", confidence: "high", sampleCount: 2, freshness: "FRESH", createdAt: "2026-10-01T00:00:00.000Z",
  };
  const result = skillPromotionBridge.deriveCreatorSkillCandidatesFromLearning([artifact], existing, new Date("2026-10-13T00:00:00.000Z"));
  assert.equal(result.length, 1);
  assert.equal(result[0].departmentId, "creator");
  assert.equal(result[0].executable, false);
  assert.equal(result[0].status, "PROPOSED");
});

test("Human Review済み（PROPOSED以外）のCandidateはブリッジによって再提案・上書きされない", () => {
  const artifact = {
    id: "learn_1", sourceType: "HUMAN_FEEDBACK", sourceIds: ["h1"], category: "WRITING",
    observation: "obs", inferredPreference: "pref", evidenceRefs: ["h1"],
    creatorFit: "HIGH", confidence: "high", sampleCount: 2, freshness: "FRESH", createdAt: "2026-10-01T00:00:00.000Z",
  };
  const first = skillPromotionBridge.deriveCreatorSkillCandidatesFromLearning([artifact], [], new Date("2026-10-13T00:00:00.000Z"));
  const approved = first.map((c) => ({ ...c, status: "APPROVED" }));
  const second = skillPromotionBridge.deriveCreatorSkillCandidatesFromLearning([artifact, artifact], approved, new Date("2026-10-14T00:00:00.000Z"));
  assert.equal(second[0].status, "APPROVED");
  assert.equal(second[0].updatedAt, approved[0].updatedAt);
});

/* ─── Protected Boundary: Investment HUMAN_ONLY / Safety / DailyX は変更しない ───── */

test("PR-XT2の新規ファイルはInvestment HUMAN_ONLYを変更しない（protected keywordとしての参照のみ）", () => {
  const modelVersioningSrc = read("app/lib/content/creator-thinking/modelVersioning.ts");
  assert.doesNotMatch(modelVersioningSrc, /HUMAN_ONLY\s*=\s*false/);
  assert.doesNotMatch(modelVersioningSrc, /placeOrder|executeTrade|investmentExecute/i);
});

test("PR-XT2はDailyX Runtime（dailyX*.ts）を一切importしない（section20: Runtime未接続）", () => {
  const newFiles = [
    "app/lib/content/creator-thinking/creatorLearning.ts",
    "app/lib/content/creator-thinking/creatorLearningStore.ts",
    "app/lib/content/creator-thinking/skillPromotionBridge.ts",
    "app/lib/content/creator-thinking/modelVersioning.ts",
    "app/lib/content/creator-thinking/modelVersioningStore.ts",
  ];
  for (const file of newFiles) {
    const source = read(file);
    assert.doesNotMatch(source, /dailyX/i);
  }
  const dailyXFiles = [
    "app/lib/note/automation/dailyX.ts",
    "app/lib/note/automation/dailyXExecution.ts",
    "app/lib/note/automation/dailyXPlan.ts",
  ].filter((file) => fs.existsSync(file));
  for (const file of dailyXFiles) {
    const source = read(file);
    assert.doesNotMatch(source, /creator-thinking/);
  }
});

test("Safety/Fact/Hot Confidence/LOW skip/Duplicate/Publish Eligibility/Bufferへの変更が無い（新規ファイルはそれらを定義しない）", () => {
  const newFiles = [
    "app/lib/content/creator-thinking/creatorLearning.ts",
    "app/lib/content/creator-thinking/modelVersioning.ts",
    "app/lib/content/creator-thinking/skillPromotionBridge.ts",
  ];
  for (const file of newFiles) {
    const source = read(file);
    assert.doesNotMatch(source, /export function (evaluateSafety|checkFact|hotConfidence|lowSkip|duplicateGuard|publishEligibility)/i);
  }
});
