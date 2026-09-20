import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";

const dist = process.env.FUND_DIST;
const learning = await import(path.join(dist, "learning/engine.js"));
const types = await import(path.join(dist, "learning/types.js"));

const NOW = "2026-09-20T00:00:00.000Z";
const recommendation = {
  id: "rec-1", ticker: "MU", horizon: "medium", decision: "BUY_CANDIDATE",
  executionAuthority: "HUMAN_ONLY", aiExecutionAllowed: false, score: 86,
  confidence: "high", dataAsOf: "2026-09-19", policyVersion: 1,
};

function decision(overrides = {}) {
  return {
    id: "dec-1", recommendationId: "rec-1", ticker: "MU", action: null,
    disposition: "ACCEPT", reason: "成長余地を採用", reasonTags: ["growth"],
    intendedAction: "BUY", reasonSource: "HUMAN_CONFIRMED", note: null,
    amountJpy: 50_000, shares: 2, decidedAt: NOW, ...overrides,
  };
}

function outcome(overrides = {}) {
  return learning.createInvestmentDecisionOutcome({
    id: "out-1", decisionId: "dec-1", recommendationId: "rec-1", ticker: "MU",
    horizon: "1M", observedAt: NOW, referencePriceAtDecision: 100,
    observedPrice: 120, source: "manual", ...overrides,
  });
}

test("A/B: BUY_CANDIDATEに対するHuman ACCEPT/REJECTとreason tagを保持する", () => {
  const reviews = learning.buildInvestmentDecisionReviews({
    recommendations: [recommendation],
    decisions: [decision(), decision({ id: "dec-2", disposition: "REJECT", reasonTags: ["valuation"] })],
    outcomes: [], learnings: [],
  });
  assert.equal(reviews[0].comparison.humanDisposition, "ACCEPT");
  assert.equal(reviews[1].humanDecision.reasonTags[0], "valuation");
  assert.equal(reviews[1].humanDecision.reasonSource, "HUMAN_CONFIRMED");
});

test("C/D: DEFERはACCEPTではなく、MODIFYは人間が決めたamount/sharesを保持する", () => {
  const reviews = learning.buildInvestmentDecisionReviews({
    recommendations: [recommendation],
    decisions: [decision({ disposition: "DEFER" }), decision({ id: "dec-2", disposition: "MODIFY", amountJpy: 50_000, shares: 2 })],
    outcomes: [], learnings: [],
  });
  assert.notEqual(reviews[0].comparison.humanDisposition, "ACCEPT");
  assert.equal(reviews[1].humanDecision.amountJpy, 50_000);
  assert.equal(reviews[1].humanDecision.shares, 2);
});

test("E: legacy actionを読み込めるが曖昧なdispositionを推測しない", () => {
  assert.equal(types.dispositionFromLegacyAction("bought"), undefined);
  assert.equal(types.dispositionFromLegacyAction("skipped"), undefined);
  assert.equal(types.dispositionFromLegacyAction("acknowledged"), undefined);
});

test("F: +20% OutcomeはPRICE_OBSERVATIONでありRealized Profitではない", () => {
  const observed = outcome();
  assert.equal(observed.priceChangePct, 20);
  assert.equal(observed.metricKind, "PRICE_OBSERVATION");
  assert.equal("realizedProfit" in observed, false);
  assert.equal("realizedPnl" in observed, false);
});

test("H/I/J: Learningはcandidate、Factと解釈を分離し、1ケースはlow", () => {
  const [review] = learning.buildInvestmentDecisionReviews({
    recommendations: [recommendation], decisions: [decision()], outcomes: [outcome()], learnings: [],
  });
  const candidate = learning.createInvestmentLearningCandidate([review], new Date(NOW));
  assert.equal(candidate.status, "candidate");
  assert.equal(candidate.confidence, "low");
  assert.notEqual(candidate.observation, candidate.interpretation);
  assert.equal(candidate.sampleSize, 1);
});

test("Time Horizonを混ぜたLearning Candidateは生成しない", () => {
  const reviews = learning.buildInvestmentDecisionReviews({
    recommendations: [recommendation],
    decisions: [decision(), decision({ id: "dec-2" })],
    outcomes: [outcome(), outcome({ id: "out-2", decisionId: "dec-2", horizon: "6M" })],
    learnings: [],
  });
  assert.throws(() => learning.createInvestmentLearningCandidate(reviews), /MIXED_OUTCOME_HORIZONS/);
});

test("Human approvalはCandidateを書き換えずeffective read modelだけをapprovedにする", () => {
  const candidate = {
    id: "learning-1", sourceDecisionIds: ["dec-1"], sourceRecommendationIds: ["rec-1"],
    sourceOutcomeIds: ["out-1"], horizon: "1M", recommendationHorizon: "medium", sampleSize: 1, observation: "fact",
    interpretation: "candidate interpretation", proposedPrinciple: null, confidence: "low",
    status: "candidate", createdAt: NOW,
  };
  const [effective] = learning.effectiveInvestmentLearnings([candidate], [{
    id: "approval-1", learningId: candidate.id, decision: "approved", decidedAt: NOW, confirmedByHuman: true,
  }]);
  assert.equal(candidate.status, "candidate");
  assert.equal(effective.status, "approved");
  assert.deepEqual(learning.approvedInvestmentLearnings([candidate]), []);
  assert.deepEqual(learning.approvedInvestmentLearnings([effective]), [effective]);
});
