/**
 * AI Thinking Model（section5/6）。
 * AIニュースを前川本人のInterpretationとして構造化する純関数。
 * ここではAI呼び出しは行わない（Runtime Integrationは別PR）。section5の10ステップの
 * 回答を受け取り、section6のAI Research Output Contractへ組み立てるだけ。
 */

import type { AIThinkingModelOutput, AIThinkingStepAnswers, FactRefBacked } from "./types";
import type { ResearchFreshness } from "../../company/research/types";

export class CreatorThinkingContractError extends Error {}

/**
 * Factとして断定する文(statement)は、必ず根拠(factRefs)を持たなければならない。
 * 根拠の無いFactは「推測で埋めたUNKNOWN」と同じ問題を起こすため、ここで止める。
 * 断定できない内容は currentInterpretation / hypothesis / unknown へ入れる。
 */
export function assertFactIsGrounded(fact: FactRefBacked): void {
  if (fact.statement.trim() !== "" && fact.factRefs.length === 0) {
    throw new CreatorThinkingContractError(
      "AI Thinking Model: Fact statement has no factRefs. Ungrounded fact must move to hypothesis/unknown, not asserted as Fact."
    );
  }
}

export function buildAIThinkingModelOutput(input: {
  sourceTopicKey: string;
  freshness: ResearchFreshness;
  steps: AIThinkingStepAnswers;
}): AIThinkingModelOutput {
  assertFactIsGrounded(input.steps.whatHappened);

  const whyItMatters = [
    input.steps.whatBecamePossible,
    input.steps.whatChangedFromBefore,
    input.steps.whoseWorkChanges,
  ]
    .filter((s) => s.trim() !== "")
    .join(" ");

  return {
    id: `aithink_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`,
    sourceTopicKey: input.sourceTopicKey,
    fact: input.steps.whatHappened,
    whyItMatters,
    practicalImpact: input.steps.practicalUseCase,
    businessImpact: input.steps.businessImpact,
    personalOrSmeImpact: input.steps.personalOrSmeImpact,
    aiCompanyUseCase: input.steps.aiCompanyApplication,
    opportunity: input.steps.businessOpportunity,
    risk: input.steps.risk,
    currentInterpretation: input.steps.currentInterpretation,
    hypothesis: input.steps.hypothesis,
    unknown: input.steps.unknown,
    freshness: input.freshness,
    evaluatedAt: new Date().toISOString(),
  };
}
