import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const DIST = process.env.CONTENT_DIST;
const types = await import(path.join(DIST, "content/creator-thinking/types.js"));
const aiThinkingModel = await import(path.join(DIST, "content/creator-thinking/aiThinkingModel.js"));
const contentThesis = await import(path.join(DIST, "content/creator-thinking/contentThesis.js"));
const creatorFit = await import(path.join(DIST, "content/creator-thinking/creatorFit.js"));
const investmentProjection = await import(path.join(DIST, "content/creator-thinking/investmentProjection.js"));

const read = (file) => fs.readFileSync(file, "utf8");

/* ─── Creator Thinking Model Contract ─────────────────── */

test("CreatorThinkingModel: 新規作成は必ずDRAFT（AIが自由にACTIVEへ昇格できない）", () => {
  const model = types.defaultCreatorThinkingModel({
    id: "ctm_1",
    owner: "maekawa",
    personality: { traits: [], basicStance: [], preferredExpressions: [], avoidedExpressions: [], writingRules: ["断定しすぎない"] },
    aiThinkingRules: types.AI_THINKING_STEPS,
    creatorFitRules: types.CREATOR_FIT_CRITERIA,
    investmentProjectionRules: ["Read-only Projectionのみ"],
  });
  assert.equal(model.status, "DRAFT");
  assert.deepEqual(model.writingRules, ["断定しすぎない"]);
  assert.equal(model.aiThinkingRules.length, 10);
});

/* ─── AI Thinking Model ────────────────────────────────── */

function validSteps(overrides = {}) {
  return {
    whatHappened: { statement: "新モデルが発表された", factRefs: ["fact_1"] },
    whatBecamePossible: "できるようになったこと",
    whatChangedFromBefore: "以前との違い",
    whoseWorkChanges: "誰の仕事が変わるか",
    practicalUseCase: "実務での使い方",
    personalOrSmeImpact: "個人・SMEへの影響",
    businessImpact: "企業への影響",
    businessOpportunity: "ビジネス機会",
    aiCompanyApplication: "AI Companyへの応用",
    whatMightHappenNext: "今後の展開",
    unknown: ["価格はまだ不明"],
    currentInterpretation: "現時点の解釈",
    hypothesis: ["仮説1"],
    risk: "リスク",
    ...overrides,
  };
}

test("AIThinkingModelOutput: Fact(statement)はfactRefsが無いと組み立てられない（推測Factの禁止）", () => {
  assert.throws(() => {
    aiThinkingModel.buildAIThinkingModelOutput({
      sourceTopicKey: "topic_1",
      freshness: "FRESH",
      steps: validSteps({ whatHappened: { statement: "根拠のない断定", factRefs: [] } }),
    });
  }, aiThinkingModel.CreatorThinkingContractError);
});

test("AIThinkingModelOutput: 空statementならfactRefsが無くても許容される（stepが無かっただけ）", () => {
  const output = aiThinkingModel.buildAIThinkingModelOutput({
    sourceTopicKey: "topic_1",
    freshness: "FRESH",
    steps: validSteps({ whatHappened: { statement: "", factRefs: [] } }),
  });
  assert.equal(output.fact.statement, "");
});

test("AIThinkingModelOutput: section6の全フィールドを保持し、unknownは明示配列のまま複製されない", () => {
  const output = aiThinkingModel.buildAIThinkingModelOutput({
    sourceTopicKey: "topic_1",
    freshness: "STALE",
    steps: validSteps(),
  });
  assert.equal(output.sourceTopicKey, "topic_1");
  assert.equal(output.freshness, "STALE");
  assert.deepEqual(output.unknown, ["価格はまだ不明"]);
  assert.deepEqual(output.hypothesis, ["仮説1"]);
  assert.match(output.whyItMatters, /できるようになったこと/);
  assert.equal(output.businessImpact, "企業への影響");
  assert.equal(output.aiCompanyUseCase, "AI Companyへの応用");
});

/* ─── Content Thesis ───────────────────────────────────── */

test("ContentThesis: AIThinkingModelOutputから生成し、Research本体ではなく参照idのみ持つ", () => {
  const output = aiThinkingModel.buildAIThinkingModelOutput({
    sourceTopicKey: "topic_1",
    freshness: "FRESH",
    steps: validSteps(),
  });
  const thesis = contentThesis.buildContentThesisFromAIThinking({
    output,
    purpose: "trust",
    creatorFitReason: "自分の学びになる",
  });
  assert.equal(thesis.sourceThinkingOutputId, output.id);
  assert.equal(thesis.intendedPurpose, "trust");
  assert.deepEqual(thesis.unknownCaveat, output.unknown);
  assert.ok(thesis.whatHappened.length >= 0);
});

test("ContentThesis: intendedPurposeは既存ContentPurpose（note/research/types.ts）をそのまま再利用する（新しい並行Purpose軸を作らない）", () => {
  const output = aiThinkingModel.buildAIThinkingModelOutput({
    sourceTopicKey: "topic_1",
    freshness: "FRESH",
    steps: validSteps(),
  });
  for (const purpose of ["reach", "trust", "note-bridge", "affiliate", "paid-note", "x-monetization"]) {
    const thesis = contentThesis.buildContentThesisFromAIThinking({ output, purpose, creatorFitReason: "r" });
    assert.equal(thesis.intendedPurpose, purpose);
  }
});

test("Creator Thinking Model層はCreatorContentPurposeという独自Purpose型を持たない（重複SSOT化していないことの確認）", () => {
  const src = fs.readFileSync("app/lib/content/creator-thinking/types.ts", "utf8");
  assert.doesNotMatch(src, /CreatorContentPurpose/);
  assert.match(src, /import type \{ ContentPurpose \} from "\.\.\/\.\.\/note\/research\/types"/);
});

/* ─── Creator Fit ───────────────────────────────────────── */

test("CreatorFit: 6criteria全てtrueの場合のみfit=true", () => {
  const allTrue = Object.fromEntries(types.CREATOR_FIT_CRITERIA.map((c) => [c, true]));
  const evalAllTrue = creatorFit.evaluateCreatorFit({ subjectId: "thesis_1", assessment: allTrue, reason: "全部満たす" });
  assert.equal(evalAllTrue.fit, true);

  const oneFalse = { ...allTrue, naturalVoice: false };
  const evalOneFalse = creatorFit.evaluateCreatorFit({ subjectId: "thesis_1", assessment: oneFalse, reason: "文体が不自然" });
  assert.equal(evalOneFalse.fit, false);
});

test("CreatorFitEvaluationはPerformance系フィールドを型として持たない（独立性の確認）", () => {
  const src = read("app/lib/content/creator-thinking/types.ts");
  const start = src.indexOf("export type CreatorFitEvaluation");
  const end = src.indexOf("};", start);
  const block = src.slice(start, end);
  for (const forbidden of ["impression", "engagement", "click", "follower", "conversion", "revenue"]) {
    assert.doesNotMatch(block.toLowerCase(), new RegExp(forbidden), `CreatorFitEvaluation must not contain performance field: ${forbidden}`);
  }
});

/* ─── Investment Projection（Read-only） ───────────────── */

test("InvestmentProjection: investmentExtが無ければnull（投資以外のArtifactを無理に投資化しない）", () => {
  const result = investmentProjection.projectInvestmentThinking({
    topicKey: "topic_ai",
    facts: [],
    interpretation: [],
    unknowns: [],
  });
  assert.equal(result, null);
});

test("InvestmentProjection: IntelligenceArtifact.investmentExtをコピーせず参照の形で写す", () => {
  const artifact = {
    topicKey: "topic_semi",
    userHypothesis: "半導体の需給は締まる",
    facts: [{ id: "fact_a", statement: "s", kind: "general", source: { reliability: "HIGH", fetchedAt: "2026-01-01" } }],
    interpretation: ["供給制約が続く"],
    unknowns: ["次四半期の価格は不明"],
    investmentExt: {
      demandChain: ["AI needs compute"],
      valueChain: ["fab", "equipment"],
      bottlenecks: [{ name: "advanced node capacity", constraintTypes: ["capacity"], factRefs: ["fact_a"] }],
      companies: [{ name: "Example Corp", role: "equipment_provider", factRefs: ["fact_a"] }],
      risks: ["需要の急減"],
    },
  };
  const projection = investmentProjection.projectInvestmentThinking(artifact);
  assert.equal(projection.sourceTopicKey, "topic_semi");
  assert.deepEqual(projection.marketStructure.demandChain, ["AI needs compute"]);
  assert.equal(projection.bottlenecks[0].name, "advanced node capacity");
  assert.equal(projection.candidateCompanies[0].name, "Example Corp");
  assert.deepEqual(projection.fact.factRefs, ["fact_a"]);
  assert.equal(projection.hypothesis, "半導体の需給は締まる");
  assert.deepEqual(projection.unknown, ["次四半期の価格は不明"]);
});

test("investmentProjection.ts は書き込み・保存関数を一切exportしない（Read-only Projectionの保証）", () => {
  const src = read("app/lib/content/creator-thinking/investmentProjection.ts");
  assert.doesNotMatch(src, /export (async )?function (save|write|persist|update|create.*Trade|place.*Order)/i);
});

test("Content Thesisは Investment Projectionからも生成できる（Investment側ロジックをコピーしない）", () => {
  const artifact = {
    topicKey: "topic_semi",
    facts: [],
    interpretation: ["供給制約が続く"],
    unknowns: [],
    investmentExt: { companies: [{ name: "Example Corp", role: "equipment_provider", factRefs: [] }], risks: ["需要の急減"] },
  };
  const projection = investmentProjection.projectInvestmentThinking(artifact);
  const thesis = contentThesis.buildContentThesisFromInvestmentProjection({
    projection,
    purpose: "trust",
    creatorFitReason: "自分のポートフォリオの学びと一致する",
  });
  assert.equal(thesis.sourceThinkingOutputId, "topic_semi");
  assert.match(thesis.audienceTakeaway, /Example Corp/);
});
